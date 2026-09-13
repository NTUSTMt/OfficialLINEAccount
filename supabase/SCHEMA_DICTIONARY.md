# 🏔️ 台科登山社社團系統：Supabase 資料表與欄位字典 (Schema Dictionary)

> **建立目的**：本文件為台科登山社系統資料層之唯一真實來源（SSOT, Single Source of Truth）。在開發前端 LIFF、後端 GAS、PostgreSQL RPC、或與 Google Sheets 同步時，**嚴禁臆測或使用不存在之欄位名稱**。任何資料庫結構變更皆須同步更新此文件。

---

## 📑 資料表概覽與 Google Sheets 分頁對齊

| Supabase 資料表名稱 | Google Sheets 對應分頁 | 主鍵 (Primary Key) | 核心功能說明 |
| :--- | :--- | :--- | :--- |
| **`members`** | `members` | `line_user_id` (TEXT) | 社員基本個資、登山經驗、體能證明與正式社籍狀態 |
| **`officers`** | `officers` | `id` (BIGSERIAL) | 社團幹部名冊、權限角色與職稱設定 |
| **`events`** | `events` | `id` (TEXT) | 登山活動行程、費用、日期、雲端資料夾與名冊試算表 |
| **`event_signups`** | `event_signups` | `id` (TEXT) | 活動隊員報名名冊、錄取審核狀態與繳費狀態 |
| **`equipments`** | `equipments` | `id` (TEXT) | 裝備庫存品項、租金、規格說明與圖庫連結 |
| **`loans`** | `loans` | `id` (TEXT) | 裝備租借主訂單、借還日期、審核狀態與租金押金 |
| **`loan_items`** | `loan_items` | `id` (BIGSERIAL) | 單筆租借單中各裝備品項與數量細項明細 |
| **`payments`** | `payments` | `id` (TEXT) | 社員繳費申報記錄、匯款末五碼、證明照片與幹部核銷 |
| **`reflections`** | `reflections` | `id` (BIGSERIAL) | 活動心得評價、難度與美景星級、登頂相片 |

---

## 1. 會員資料表 (`members`)

- **對應分頁**：`members`
- **主鍵**：`line_user_id` (LINE 系統唯一識別碼，格式如 `U1234567...`)

| 欄位名稱 (English Column) | 資料型別 (PostgreSQL Type) | 允許 NULL | 預設值 (Default) | ENUM / 允許值 | 繁體中文說明與用途 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `line_user_id` | `TEXT` | 否 | 無 | - | **系統識別碼** (LINE UID，主鍵) |
| `name` | `TEXT` | 否 | 無 | - | **姓名** (社員真實姓名) |
| `gender` | `TEXT` | 是 | NULL | `男`, `女`, `其他` | **性別** |
| `line_id` | `TEXT` | 是 | NULL | - | **自訂 Line ID** (方便幹部聯絡) |
| `email` | `TEXT` | 是 | NULL | - | **聯絡信箱** |
| `phone` | `TEXT` | 是 | NULL | - | **聯絡電話** (手機號碼) |
| `department` | `TEXT` | 是 | NULL | - | **系所** (如：資工系、企管所) |
| `student_id` | `TEXT` | 是 | NULL | - | **學號** (校外人士可填身分備註) |
| `payment_status` | `payment_status_enum` | 否 | `'未繳費 Unpaid'` | `已繳費 Paid`<br>`待確認 Checking`<br>`未繳費 Unpaid` | **繳費狀態** (社費繳納狀態，連動正式社員身分) |
| `membership_expires_at`| `DATE` | 是 | NULL | - | **社籍到期日** (格式：`YYYY-MM-DD`) |
| `birthday` | `TEXT` | 是 | NULL | - | **生日** (格式：`YYYY-MM-DD`) |
| `id_card` | `TEXT` | 是 | NULL | - | **證件號碼** (身分證字號或居留證號，保險用) |
| `address` | `TEXT` | 是 | NULL | - | **聯絡地址** (學生租屋處或戶籍地址) |
| `outdoor_experience` | `TEXT` | 是 | NULL | - | **爬山經驗** (百岳座數、中級山經歷) |
| `fitness_desc` | `TEXT` | 是 | NULL | - | **體能測驗自述** |
| `proof_urls` | `JSONB` | 是 | `'[]'::jsonb` | 字串陣列 | **體能證明照片網址陣列** (Google Drive 直連) |
| `emergency_contact_name`| `TEXT` | 是 | NULL | - | **緊急聯絡人姓名** |
| `emergency_contact_rel` | `TEXT` | 是 | NULL | - | **緊急聯絡人關係** (如：父子、夫妻、朋友) |
| `emergency_contact_phone`| `TEXT` | 是 | NULL | - | **緊急聯絡人電話** |
| `emergency_contact_address`|`TEXT` | 是 | NULL | - | **緊急聯絡人地址** |
| `medical_history` | `TEXT` | 是 | NULL | - | **個人特殊病史或過敏藥物** (入山安全防護) |
| `identity_status` | `TEXT` | 是 | NULL | - | **身分狀態** (本校生 / 校友 / 外校生 / 社會人士) |
| `join_membership_intent`| `TEXT` | 是 | NULL | - | **加入社員意願** |
| `officer_intent` | `TEXT` | 是 | NULL | - | **擔任幹部意願** (初次填寫或改為有意願會推播) |
| `is_official_member` | `BOOLEAN` | 否 | `FALSE` | `TRUE`, `FALSE` | **正式社員身分** (由繳費或管理員判定) |
| `is_officer` | `BOOLEAN` | 是 | `FALSE` | `TRUE`, `FALSE` | **是否為幹部** (連動幹部名冊與後台權限) |
| `officer_role` | `TEXT` | 是 | `'幹部'` | - | **幹部職責角色** |
| `created_at` | `TIMESTAMPTZ` | 是 | `NOW()` | - | **建立時間** |
| `updated_at` | `TIMESTAMPTZ` | 是 | `NOW()` | - | **最後更新時間** |

---

## 2. 幹部名冊資料表 (`officers`)

- **對應分頁**：`officers`
- **主鍵**：`id` (BIGSERIAL 自增流水號)
- **外鍵**：`line_user_id` -> `members(line_user_id)`

| 欄位名稱 (English Column) | 資料型別 (PostgreSQL Type) | 允許 NULL | 預設值 (Default) | 繁體中文說明與用途 |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL` | 否 | 自增 | **幹部編號** (主鍵) |
| `line_user_id` | `TEXT` | 是 | NULL | **系統識別碼** (關聯 `members.line_user_id`) |
| `name` | `TEXT` | 否 | `'幹部'` | **幹部姓名** |
| `role` | `TEXT` | 否 | `'幹部'` | **權限角色** (如 `admin`, `equipment_officer`, `cadre`) |
| `title` | `TEXT` | 是 | `'幹部'` | **社團職稱** (如 `社長`, `嚮導長`, `裝備長`, `總務`) |
| `contact` | `TEXT` | 是 | NULL | **聯絡資訊或電話** |
| `created_at` | `TIMESTAMPTZ` | 是 | `NOW()` | **建立時間** |
| `updated_at` | `TIMESTAMPTZ` | 是 | `NOW()` | **最後更新時間** |

---

## 3. 活動資料表 (`events`)

- **對應分頁**：`events`
- **主鍵**：`id` (活動編號，如 `E01`, `E20260901_01`)

| 欄位名稱 (English Column) | 資料型別 (PostgreSQL Type) | 允許 NULL | 預設值 (Default) | ENUM / 允許值 | 繁體中文說明與用途 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `TEXT` | 否 | 無 | - | **活動編號** (主鍵) |
| `title` | `TEXT` | 否 | 無 | - | **活動名稱** |
| `fee` | `INTEGER` | 否 | `0` | - | **預計費用** (新台幣，純整數) |
| `start_date` | `DATE` | 否 | 無 | - | **活動開始日期** (`YYYY-MM-DD`) |
| `end_date` | `DATE` | 否 | 無 | - | **活動結束日期** (`YYYY-MM-DD`) |
| `deadline` | `TIMESTAMPTZ` | 否 | 無 | - | **報名截止時間** |
| `status` | `TEXT` | 否 | `'開放'` | `開放`, `關閉`, `已結束` | **報名狀態** |
| `summary` | `TEXT` | 是 | NULL | - | **活動簡介** (建議 1000 字以內) |
| `itinerary` | `TEXT` | 是 | NULL | - | **詳細行程規劃** (建議 700 字以內) |
| `cover_image_url` | `TEXT` | 是 | NULL | - | **活動封面圖網址** |
| `drive_folder_url` | `TEXT` | 是 | NULL | - | **Google Drive 專屬活動相簿/資料夾網址** |
| `spreadsheet_url` | `TEXT` | 是 | NULL | - | **專屬活動名冊試算表完整網址** |
| `spreadsheet_id` | `TEXT` | 是 | NULL | - | **專屬名冊試算表 ID** (供 GAS 快速追加名冊) |
| `created_at` | `TIMESTAMPTZ` | 是 | `NOW()` | - | **建立時間** |
| `updated_at` | `TIMESTAMPTZ` | 是 | `NOW()` | - | **最後更新時間** |

---

## 4. 活動報名名冊 (`event_signups`)

- **對應分頁**：`event_signups`
- **主鍵**：`id` (報名專屬碼，如 `S123456`)
- **外鍵**：`event_id` -> `events(id)`、`line_user_id` -> `members(line_user_id)`

| 欄位名稱 (English Column) | 資料型別 (PostgreSQL Type) | 允許 NULL | 預設值 (Default) | ENUM / 下拉選單值 | 繁體中文說明與用途 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `TEXT` | 否 | 無 | - | **報名專屬碼** (主鍵) |
| `event_id` | `TEXT` | 否 | 無 | - | **活動編號** (關聯 `events.id`) |
| `line_user_id` | `TEXT` | 否 | 無 | - | **系統識別碼** (關聯 `members.line_user_id`) |
| `name` | `TEXT` | 是 | NULL | - | **隊員姓名** (直觀檢視) |
| `status` | `event_signup_status_enum` | 否 | `'審核中 Checking'` | 1. `正取 Confirmed`<br>2. `正取（已繳費）Confirmed (Paid)`<br>3. `備取 Waitlisted`<br>4. `備取（有意願）Waitlisted (Interested)`<br>5. `審核中 Checking`<br>6. `已取消 Cancelled` | **審核結果 / 報名狀態** (Supabase Table Editor 原生下拉選單) |
| `payment_status` | `payment_status_enum` | 否 | `'未繳費 Unpaid'` | 1. `已繳費 Paid`<br>2. `待確認 Checking`<br>3. `未繳費 Unpaid` | **繳費狀態** (活動款項繳納進度，原生下拉選單) |
| `is_official_member_snapshot`| `BOOLEAN` | 否 | `FALSE` | `TRUE`, `FALSE` | **報名時社員身分快照** (紀錄當下是否享有社員價) |
| `cancel_reason` | `TEXT` | 是 | NULL | - | **取消報名原因** |
| `notes` | `TEXT` | 是 | NULL | - | **備註資訊** (如：【已繳費待退款】、特殊飲食) |
| `created_at` | `TIMESTAMPTZ` | 是 | `NOW()` | - | **報名登記時間** |
| `updated_at` | `TIMESTAMPTZ` | 是 | `NOW()` | - | **最後更新時間** |

---

## 5. 裝備品項資料表 (`equipments`)

- **對應分頁**：`equipments`
- **主鍵**：`id` (裝備代號，如 `EQ_TENT_01`)

| 欄位名稱 (English Column) | 資料型別 (PostgreSQL Type) | 允許 NULL | 預設值 (Default) | ENUM / 允許值 | 繁體中文說明與用途 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `TEXT` | 否 | 無 | - | **裝備代號** (主鍵) |
| `name` | `TEXT` | 否 | 無 | - | **裝備名稱** (如：MSR 雙人帳篷) |
| `category` | `equipment_category` | 否 | `'其他裝備'` | `睡眠系統`, `背負系統`, `炊事系統`, `照明通訊`, `攀登技術`, `行進安全`, `其他裝備` | **裝備類別** |
| `total_qty` | `INTEGER` | 否 | `0` | - | **總庫存數量** |
| `available_qty` | `INTEGER` | 否 | `0` | - | **目前可借數量** |
| `is_borrowable` | `BOOLEAN` | 否 | `TRUE` | `TRUE`, `FALSE` | **是否開放借用** |
| `member_price_per_day` | `INTEGER` | 否 | `0` | - | **社員每日租金** |
| `non_member_price_per_day`|`INTEGER` | 否 | `0` | - | **非社員每日租金** |
| `price_2day` | `INTEGER` | 是 | `0` | - | **2天基本租金** (短天期固定計費) |
| `price_extra_day` | `INTEGER` | 是 | `0` | - | **續租每日租金** |
| `images` | `JSONB` | 是 | `'[]'::jsonb` | 直連字串陣列 | **裝備照片網址陣列** (Google Drive 直連網址) |
| `specs` | `TEXT` | 是 | NULL | - | **裝備規格描述** (重量、材質、容積等) |
| `notes` | `TEXT` | 是 | NULL | - | **備註說明** (使用注意事項、保養指引) |
| `sort_order` | `INTEGER` | 是 | `0` | - | **排序權重** (數字越小排越前) |
| `created_at` | `TIMESTAMPTZ` | 是 | `NOW()` | - | **建立時間** |
| `updated_at` | `TIMESTAMPTZ` | 是 | `NOW()` | - | **最後更新時間** |

---

## 6. 裝備租借主訂單 (`loans`)

- **對應分頁**：`loans`
- **主鍵**：`id` (租借單號，如 `ORD_20260912_01`)
- **外鍵**：`line_user_id` -> `members(line_user_id)`

| 欄位名稱 (English Column) | 資料型別 (PostgreSQL Type) | 允許 NULL | 預設值 (Default) | ENUM / 下拉選單值 | 繁體中文說明與用途 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `TEXT` | 否 | 無 | - | **租借單號** (主鍵) |
| `line_user_id` | `TEXT` | 否 | 無 | - | **借用人系統識別碼** (關聯 `members.line_user_id`) |
| `name` | `TEXT` | 是 | NULL | - | **借用人姓名** |
| `start_date` | `DATE` | 否 | 無 | - | **預計領取日期** (`YYYY-MM-DD`) |
| `end_date` | `DATE` | 否 | 無 | - | **預計歸還日期** (`YYYY-MM-DD`) |
| `days` | `INTEGER` | 否 | `1` | - | **租借天數** |
| `purpose` | `TEXT` | 否 | `'社團出隊'` | `社團出隊`, `個人登山`, `其他` | **租借用途** |
| `purpose_other` | `TEXT` | 是 | NULL | - | **其他用途說明** |
| `status` | `TEXT` | 否 | `'待領取 To Be Collected'` | `待領取 To Be Collected`<br>`租借中 Borrowed`<br>`已歸還 Returned`<br>`已取消 Cancelled`<br>`已取消 (待退款)` | **租借訂單狀態** |
| `payment_status` | `payment_status_enum` | 否 | `'未繳費 Unpaid'` | 1. `已繳費 Paid`<br>2. `待確認 Checking`<br>3. `未繳費 Unpaid` | **租金繳費狀態** (原生下拉選單) |
| `total_deposit` | `INTEGER` | 否 | `0` | - | **保證金 / 押金總計** |
| `total_rent` | `INTEGER` | 否 | `0` | - | **總租金** (新台幣) |
| `notes` | `TEXT` | 是 | NULL | - | **備註事項** |
| `refund_needed` | `BOOLEAN` | 是 | `FALSE` | `TRUE`, `FALSE` | **是否需退款** (取消訂單且已繳費時為 TRUE) |
| `cancelled_at` | `TIMESTAMPTZ` | 是 | NULL | - | **取消時間戳記** |
| `created_at` | `TIMESTAMPTZ` | 是 | `NOW()` | - | **建立時間** |
| `updated_at` | `TIMESTAMPTZ` | 是 | `NOW()` | - | **最後更新時間** |

---

## 7. 裝備租借品項明細 (`loan_items`)

- **對應分頁**：`loan_items`
- **主鍵**：`id` (BIGSERIAL)
- **外鍵**：`loan_id` -> `loans(id)`、`equipment_id` -> `equipments(id)`

| 欄位名稱 (English Column) | 資料型別 (PostgreSQL Type) | 允許 NULL | 預設值 (Default) | 繁體中文說明與用途 |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL` | 否 | 自增 | **明細流水號** (主鍵) |
| `loan_id` | `TEXT` | 否 | 無 | **租借主單號** (關聯 `loans.id`) |
| `equipment_id` | `TEXT` | 否 | 無 | **裝備代號** (關聯 `equipments.id`) |
| `quantity` | `INTEGER` | 否 | `1` | **借用數量** (必須 > 0) |
| `unit_price_snapshot` | `INTEGER` | 否 | `0` | **下單當下單價快照** |
| `subtotal` | `INTEGER` | 否 | `0` | **品項小計金額** |

---

## 8. 繳費申報資料表 (`payments`)

- **對應分頁**：`payments`
- **主鍵**：`id` (繳費單號，如 `PAY_20260912_01`)
- **外鍵**：`line_user_id` -> `members(line_user_id)`

| 欄位名稱 (English Column) | 資料型別 (PostgreSQL Type) | 允許 NULL | 預設值 (Default) | ENUM / 允許值 | 繁體中文說明與用途 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `TEXT` | 否 | 無 | - | **繳費單號** (主鍵) |
| `line_user_id` | `TEXT` | 否 | 無 | - | **申報人系統識別碼** |
| `name` | `TEXT` | 是 | NULL | - | **申報人姓名** |
| `type` | `TEXT` | 否 | 無 | `繳交社費`, `活動：<名稱>`, `裝備租借`, `多筆合併` | **繳費項目自述標題** |
| `target_type` | `TEXT` | 是 | NULL | `membership`, `event`, `loan`, `multi` | **關聯業務目標類型** |
| `target_id` | `TEXT` | 是 | NULL | - | **目標編號** (活動 ID、租借單號或 NULL) |
| `amount` | `INTEGER` | 否 | `0` | - | **申報匯款金額** (新台幣) |
| `bank_last5` | `TEXT` | 是 | NULL | - | **匯款帳號末五碼** |
| `proof_image_url` | `TEXT` | 是 | NULL | - | **匯款證明相片網址** (Google Drive 直連) |
| `status` | `TEXT` | 否 | `'待確認 Checking'` | `待確認 Checking`<br>`已核銷 Confirmed`<br>`退件 Rejected` | **款項核銷審核狀態** |
| `officer_notes` | `TEXT` | 是 | NULL | - | **幹部審核備註 / 退件原因** |
| `confirmed_by` | `TEXT` | 是 | NULL | - | **核銷幹部身分 / 姓名** |
| `confirmed_at` | `TIMESTAMPTZ` | 是 | NULL | - | **核銷確認時間** |
| `created_at` | `TIMESTAMPTZ` | 是 | `NOW()` | - | **申報送出時間** |
| `updated_at` | `TIMESTAMPTZ` | 是 | `NOW()` | - | **最後更新時間** |

---

## 9. 活動心得與登頂相片 (`reflections`)

- **對應分頁**：`reflections`
- **主鍵**：`id` (BIGSERIAL)
- **外鍵**：`event_id` -> `events(id)`、`line_user_id` -> `members(line_user_id)`
- **唯一約束**：`UNIQUE (event_id, line_user_id)`

| 欄位名稱 (English Column) | 資料型別 (PostgreSQL Type) | 允許 NULL | 預設值 (Default) | 繁體中文說明與用途 |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL` | 否 | 自增 | **心得流水號** (主鍵) |
| `event_id` | `TEXT` | 否 | 無 | **活動編號** |
| `line_user_id` | `TEXT` | 否 | 無 | **隊員系統識別碼** |
| `name` | `TEXT` | 是 | NULL | **隊員姓名** |
| `difficulty_rating` | `INTEGER` | 是 | NULL | **活動難度星級評分** (1 ~ 5) |
| `beauty_rating` | `INTEGER` | 是 | NULL | **美景星級評分** (1 ~ 5) |
| `content` | `TEXT` | 是 | NULL | **心得內文自述** |
| `photo_urls` | `JSONB` | 是 | `'[]'::jsonb` | **相片網址陣列** (Google Drive 直連) |
| `created_at` | `TIMESTAMPTZ` | 是 | `NOW()` | **填寫送出時間** |
| `updated_at` | `TIMESTAMPTZ` | 是 | `NOW()` | **最後更新時間** |

---

## 💡 Google Sheets 表頭中英混用辨識規則

在 Google Sheets 主試算表中，程式以 **英文欄位名稱** 作為唯一鍵值。當幹部在表頭加入中文時，系統遵循以下正則字詞邊界規則：
```regex
(^|[^a-zA-Z0-9_])<column_name>([^a-zA-Z0-9_]|$)
```
- **支援範例**：
  - `status 審核狀態` ✅
  - `審核狀態 (status)` ✅
  - `[status]` ✅
  - `status` ✅
  - `payment_status 繳費狀態` ✅
- **絕對防呆**：
  - 搜尋 `status` 時，絕不會誤判 `payment_status`。
  - 搜尋 `id` 時，絕不會誤判 `line_user_id` 或 `event_id`。
