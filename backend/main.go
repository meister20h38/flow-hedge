package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

type SelectionStep struct {
	ID            int        `json:"id"` // uint から int に変更
	CompanyID     uint       `json:"company_id"`
	StepName      string     `json:"step_name"`
	Status        string     `json:"status"`
	ScheduledDate *time.Time `json:"scheduled_date"` // 名前を Date に統一
	Endtime       *time.Time `json:"end_time,omitempty"`
	StepOrder     int        `json:"step_order"`
}

type Company struct {
	ID             int             `json:"id"`
	Name           string          `json:"name"`
	Priority       int             `json:"priority"`
	SelectionGroup string          `json:"selection_group"`
	Steps          []SelectionStep `json:"steps"` // ステップのリストを保持
}

type UpdateStepOrderInput struct {
	Steps []struct {
		ID        int `json:"id"`
		StepOrder int `json:"step_order"`
	} `json:"steps"`
}

func main() {
	dsn := os.Getenv("DB_SOURCE")
	if dsn == "" {
		dsn = "host=localhost user=postgres password=password dbname=flow_hedge port=5432 sslmode=disable"
	}
	var db *sqlx.DB
	var err error

	// 最大10回リトライするロジック
	for i := 0; i < 10; i++ {
		db, err = sqlx.Open("postgres", dsn)
		if err == nil {
			err = db.Ping() // 実際に通信できるか確認
		}

		if err == nil {
			log.Println("Successfully connected to database!")
			break
		}

		log.Printf("Failed to connect to DB (attempt %d): %v", i+1, err)
		time.Sleep(2 * time.Second) // 2秒待ってリトライ
	}

	if err != nil {
		log.Fatal("Could not connect to database after several attempts")
	}

	r := gin.Default()

	// CORSミドルウェアを追加
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	// 疎通確認用エンドポイント
	r.GET("/health", func(c *gin.Context) {
		err := db.Ping()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"status": "db error"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok", "message": "Go & DB are connected!"})
	})

	// 企業一覧API（DBから取得）
	// --- 企業一覧API（DBから取得） ---
	r.GET("/companies", func(c *gin.Context) {
		rows, err := db.Query(`
            SELECT c.id, c.name, c.priority, c.selection_group,
                s.id, 
                COALESCE(s.step_name, ''), 
                COALESCE(s.status, ''), 
                s.scheduled_date, -- ::text を外してそのまま取得
				s.end_time,
                COALESCE(s.step_order, 0)
            FROM companies c
            LEFT JOIN selection_steps s ON c.id = s.company_id
            ORDER BY 
                CASE c.selection_group 
                    WHEN '第一志望群' THEN 1 
                    WHEN '第二志望群' THEN 2 
                    WHEN '検討中' THEN 3
                    ELSE 4 
                END ASC, 
				c.id ASC,
				s.step_order ASC,
				s.id ASC
        `)
		if err != nil {
			log.Printf("Query error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()

		companyMap := make(map[int]*Company)
		var companyIds []int

		for rows.Next() {
			var cid, priority, sorder int
			var cname, sgroup, sname, sstatus string
			var sidPtr *int
			var sdate, sendtime *time.Time

			err := rows.Scan(&cid, &cname, &priority, &sgroup, &sidPtr, &sname, &sstatus, &sdate, &sendtime, &sorder)
			if err != nil {
				log.Printf("Scan error: %v", err)
				continue
			}

			if _, ok := companyMap[cid]; !ok {
				companyMap[cid] = &Company{
					ID:             cid,
					Name:           cname,
					Priority:       priority,
					SelectionGroup: sgroup, // ここでマッピング
					Steps:          []SelectionStep{},
				}
				companyIds = append(companyIds, cid)
			}

			if sidPtr != nil {
				companyMap[cid].Steps = append(companyMap[cid].Steps, SelectionStep{
					ID:            *sidPtr, // これで int 同士なので通ります
					StepName:      sname,
					Status:        sstatus,
					ScheduledDate: sdate, // 名前を修正
					Endtime:       sendtime,
					StepOrder:     sorder,
				})
			}
		}

		result := []Company{}
		for _, id := range companyIds {
			result = append(result, *companyMap[id])
		}
		c.JSON(http.StatusOK, result)
	})

	// --- 企業追加API ---
	r.POST("/companies", func(c *gin.Context) {
		var newCompany Company
		if err := c.ShouldBindJSON(&newCompany); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "無効なデータです"})
			return
		}

		query := "INSERT INTO companies (name, priority, selection_group) VALUES ($1, $2, $3) RETURNING id"
		var lastInsertId int
		err := db.QueryRow(query, newCompany.Name, newCompany.Priority, newCompany.SelectionGroup).Scan(&lastInsertId)

		if err != nil {
			// PostgreSQLの「一意性制約違反」エラーコード 23505 をチェック
			log.Printf("Insert error: %v", err)
			c.JSON(http.StatusConflict, gin.H{"error": "その企業名は既に登録されています"})
			return
		}

		newCompany.ID = lastInsertId
		c.JSON(http.StatusCreated, newCompany)
	})

	// --- 選考ステップ追加API（修正済み） ---
	r.POST("/companies/:id/steps", func(c *gin.Context) {
		companyID := c.Param("id")
		var step SelectionStep

		if err := c.ShouldBindJSON(&step); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "無効なデータです"})
			return
		}

		var nextOrder int
		db.QueryRow("SELECT COALESCE(MAX(step_order), 0) + 1 FROM selection_steps WHERE company_id = $1", companyID).Scan(&nextOrder)

		// 修正: ここがSELECT文になっていたので INSERT 文に書き換えました
		query := `
            INSERT INTO selection_steps (company_id, step_name, status, scheduled_date, end_time, step_order)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
        `
		// ScheduledDate に修正
		err := db.QueryRow(query, companyID, step.StepName, step.Status, step.ScheduledDate, step.Endtime, nextOrder).Scan(&step.ID)

		if err != nil {
			log.Printf("Step insert error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ステップの保存に失敗しました"})
			return
		}

		c.JSON(http.StatusCreated, step)
	})

	r.PATCH("/steps/:id", func(c *gin.Context) {
		id := c.Param("id")
		var input struct {
			StepName      *string    `json:"step_name"` // ポインタにすることで「未送信(nil)」を判別
			Status        *string    `json:"status"`
			ScheduledDate *time.Time `json:"scheduled_date"`
			EndTime       *time.Time `json:"end_time"`
			StepOrder     *int       `json:"step_order"`
		}

		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}

		// 動的にクエリを組み立てる（送られた項目だけSETする）
		query := `
        	UPDATE selection_steps 
			SET step_name = COALESCE($1, step_name), 
        		status = COALESCE($2, status), 
        		scheduled_date = COALESCE($3, scheduled_date),
        		end_time = COALESCE($4, end_time),
        		step_order = COALESCE($5, step_order)
    		WHERE id = $6
    	`
		_, err := db.Exec(query, input.StepName, input.Status, input.ScheduledDate, input.EndTime, input.StepOrder, id)

		if err != nil {
			log.Printf("Update error: %v", err)
			c.JSON(500, gin.H{"error": "更新失敗"})
			return
		}
		c.JSON(200, gin.H{"status": "updated"})
	})

	r.DELETE("/steps/:id", func(c *gin.Context) {
		stepID := c.Param("id")
		_, err := db.Exec("DELETE FROM selection_steps WHERE id = $1", stepID)
		if err != nil {
			log.Printf("Step delete error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "削除に失敗しました"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "削除しました"})
	})

	// --- 志望群（グループ）更新API ---
	r.PATCH("/companies/:id/group", func(c *gin.Context) {
		id := c.Param("id")
		var input struct {
			SelectionGroup string `json:"selection_group"`
		}

		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "無効なリクエストです"})
			return
		}

		_, err := db.Exec("UPDATE companies SET selection_group = $1 WHERE id = $2", input.SelectionGroup, id)
		if err != nil {
			log.Printf("Group update error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "グループの更新に失敗しました"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok", "selection_group": input.SelectionGroup})
	})

	// --- 企業削除API（念のため追加：以前のコードに無かった場合） ---
	r.DELETE("/companies/:id", func(c *gin.Context) {
		id := c.Param("id")
		// 外部参照（steps）がある場合はカスケード削除される設定か確認が必要ですが、
		// 安全のためにここで企業を削除します。
		_, err := db.Exec("DELETE FROM companies WHERE id = $1", id)
		if err != nil {
			log.Printf("Company delete error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "削除に失敗しました"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "企業を削除しました"})
	})

	r.PATCH("/companies/:id/steps/reorder", func(c *gin.Context) {
		var input UpdateStepOrderInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "無効なデータ形式です"})
			return
		}

		// トランザクション開始（途中で失敗したらロールバックするため）
		tx, err := db.Beginx()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "トランザクションの開始に失敗"})
			return
		}

		for _, s := range input.Steps {
			// ログを追加して、実際に届いている値を確認
			log.Printf("Updating Step ID: %d to Order: %d", s.ID, s.StepOrder)

			res, err := tx.Exec("UPDATE selection_steps SET step_order = $1 WHERE id = $2", s.StepOrder, s.ID)
			if err != nil {
				log.Printf("Update error for ID %d: %v", s.ID, err)
				tx.Rollback()
				c.JSON(500, gin.H{"error": "更新失敗"})
				return
			}

			// 実際に更新されたか確認
			affected, _ := res.RowsAffected()
			log.Printf("Rows affected: %d", affected)
		}

		if err := tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "コミットに失敗"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	r.Run(":8080")
}
