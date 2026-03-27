-- 一旦削除
DROP TABLE IF EXISTS selection_steps;
DROP TABLE IF EXISTS companies CASCADE;

-- 企業テーブル
CREATE TABLE companies (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    priority INTEGER DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 選考ステップテーブル
CREATE TABLE selection_steps (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    step_name TEXT NOT NULL,
    status TEXT DEFAULT '未着手',
    scheduled_date DATE,
    step_order INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- サンプルデータ
INSERT INTO companies (name, priority) VALUES ('Google', 1), ('Sony', 2);