-- 各企業のステップに 1, 2, 3... と連番を振り直すSQL
WITH updated AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY id) as new_order
  FROM selection_steps
)
UPDATE selection_steps
SET step_order = updated.new_order
FROM updated
WHERE selection_steps.id = updated.id;