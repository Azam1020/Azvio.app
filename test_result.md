#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  AZVIO - إضافات وتعديلات على تطبيق إدارة أعمال التصوير الجوي والمونتاج:
  1. تغيير هوية بصرية: شعار AZVIO الرسمي بدلاً من النصي + لون الهوية #3E9194 بدلاً من البرتقالي.
  2. اختصار الروابط السريعة إلى رابطين فقط: منصة رائد + موقع azvio.co
  3. نوع الخدمة الأساسي هو Drone/Editing/كلاهما، مع فئات فرعية للـ Drone (عقاري، فعاليات، إلخ).
     - الفئات تُضاف بطريقتين: اقتراح من سند أو إضافة يدوية (مع شرح مختصر لسند فقط).
  4. سجل النشاط للعميل يقبل رفع ملفات (PDF/صور) + ملاحظات نصية.
  5. عند إدخال السعر، سند يقارنه فوراً بسعر السوق ويعرض رأيه تلقائياً بدون طلب.
  6. رسوم بيانية حية للدخل والمصاريف والمحتوى في الشاشة الرئيسية.
  7. الرئيسية قابلة للتخصيص (إظهار/إخفاء الأقسام).
  8. زر "سند يساعدني" في المحتوى (اقتراح أفكار فيديو) والخدمات (اقتراح خدمات وأسعار).

backend:
  - task: "Categories CRUD (client sub-categories)"
    implemented: true
    working: "NA"
    file: "/app/backend/crud_routes.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Added /api/categories endpoints (list, create, update, delete) with service_type filter. Seeds 7 default categories on startup."

  - task: "Client sub_category field + activity log with attachments"
    implemented: true
    working: "NA"
    file: "/app/backend/crud_routes.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Added sub_category to Client model. LogCreate now accepts attachment_name/mime/data (base64). Added GET /api/clients/{id}/logs/{log_id}/attachment to retrieve stored attachments."

  - task: "Sanad price opinion endpoint (auto market comparison)"
    implemented: true
    working: "NA"
    file: "/app/backend/sanad.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "POST /api/sanad/price-opinion returns {opinion, verdict, market_min, market_max}. Uses gemini-3.5-flash for speed. Tested manually with drone/عقاري/1500 → returned fair verdict + 1000-2500 range."

  - task: "Sanad suggestions: categories/content/services"
    implemented: true
    working: "NA"
    file: "/app/backend/sanad.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Added /api/sanad/suggest-categories, /api/sanad/suggest-content, /api/sanad/suggest-services. All tested manually and returned valid arrays."

  - task: "Sanad action protocol: add_category + add_service"
    implemented: true
    working: "NA"
    file: "/app/backend/sanad.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Extended run_action to support add_category and add_service actions from Sanad chat. Also added sub_category to add_client action."

  - task: "Dashboard time-series endpoint"
    implemented: true
    working: "NA"
    file: "/app/backend/crud_routes.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "GET /api/dashboard/timeseries?months=6 returns per-month income/expense/new_clients arrays."

  - task: "Quick links simplified to 2 default links"
    implemented: true
    working: "NA"
    file: "/app/backend/crud_routes.py"
    stuck_count: 0
    priority: "low"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Seed now only inserts 2 links (منصة رائد + موقع AZVIO). Frontend links.tsx now hardcodes these 2 links so DB is not used for listing."

frontend:
  - task: "Real AZVIO logo + brand color #3E9194"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/theme.ts, /app/frontend/assets/images/azvio-logo.png, login.tsx, (tabs)/index.tsx, index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Downloaded real AZVIO logo (from user assets), replaced text wordmark on login/index/dashboard. Changed brand color from #D95D39 (orange) to #3E9194 (teal). Updated app icons (icon.png, favicon.png, adaptive-icon.png, splash-image.png)."

  - task: "Client add/edit with sub_category picker + Sanad price opinion inline"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/clients.tsx, /app/frontend/app/client/[id].tsx, /app/frontend/src/CategoryPicker.tsx, /app/frontend/src/SanadPriceOpinion.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "CategoryPicker component with manage modal: existing categories chips, manual add, Sanad suggestions. SanadPriceOpinion component: auto-debounced (900ms) after price entry, shows verdict badge (fair/low/high) + opinion text + market range. Verified visually in screenshot."

  - task: "Client activity log with file upload (PDF/images)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/client/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Added expo-document-picker file upload. Reads file as base64 (web via FileReader, native via expo-file-system/legacy) and posts to /api/clients/{id}/logs with attachment fields. View attachment opens data URI in new tab (web) or WebBrowser (native)."

  - task: "Sanad helps me buttons (content + services)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/content.tsx, /app/frontend/app/services.tsx, /app/frontend/src/SanadSuggestModal.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Reusable SanadSuggestModal with topic input (content) or service selector (services). One-tap accept adds item to DB. Verified visually — content suggestions render correctly."

  - task: "Dashboard live charts + personalization"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Added BarChart (income/expenses last 6 months) and PieChart (content stages breakdown) via react-native-gifted-charts. Personalize modal (⚙ icon in header) lets user toggle 5 widgets on/off; prefs saved in AsyncStorage. Verified visually."

  - task: "Simplified quick links (2 fixed links)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/links.tsx"
    stuck_count: 0
    priority: "low"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Hard-coded 2 links: منصة رائد (raed.gov.sa) + موقع AZVIO (azvio.co). Removed add/edit/delete UI."

metadata:
  created_by: "main_agent"
  version: "2.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "Categories CRUD (client sub-categories)"
    - "Client sub_category field + activity log with attachments"
    - "Sanad price opinion endpoint (auto market comparison)"
    - "Sanad suggestions: categories/content/services"
    - "Dashboard time-series endpoint"
    - "Real AZVIO logo + brand color #3E9194"
    - "Client add/edit with sub_category picker + Sanad price opinion inline"
    - "Client activity log with file upload (PDF/images)"
    - "Sanad helps me buttons (content + services)"
    - "Dashboard live charts + personalization"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    - agent: "main"
      message: |
        Phase B (Iteration 3) complete. Implemented per user request:
        1. **PWA Export**: manifest.json + sw.js in /public, PWA meta in +html.tsx, install button in dashboard (web only).
        2. **Editable Quick Links**: full CRUD, seeded with 2 defaults (منصة رائد + azvio.co). Old seeds cleaned via one-time migration.
        3. **Custom Service Types collection**: `/api/service-types` CRUD, seeded drone + editing as defaults (protected from delete). `/api/sanad/explain-service-type` gives description + target audience + typical price + tips.
        4. **My Pricing (personal price knowledge base)**: `/api/my-pricing` CRUD + new `/pricing` screen where user manages ranges per service_type + sub_category. `/api/sanad/pricing-advice` compares all user pricing vs market and gives per-item verdict.
        5. **Enhanced Finance screen**: new "الإحصائيات" segment with BarChart (income vs expense 6mo), LineChart (net trend), PieChart (type breakdown), top categories bar list, top clients rank list. Backend: `/api/finance/statistics`.
        6. **Bank Statement upload**: `/api/finance/statement/analyze` (multipart) uses Gemini 3.1 Pro to extract transactions from PDF/image, then **file is auto-deleted from server immediately** (privacy). `/api/finance/statement/save` inserts selected transactions.
        7. **Weekly Insights screen** (`/insights`): shows week metrics + Sanad's headline/wins/alerts/focus-next-week. Backend: `/api/insights/weekly` generates fresh AI-powered report on demand.
        8. **Sanad shortcut in finance**: floating brand button next to bottom actions.
        
        All new endpoints verified by testing subagent (37/38 passing; 1 seed issue fixed via one-time migration).
        
        **Deferred** (awaiting user credentials):
        - Google Calendar OAuth (needs GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET)
        - Supabase Storage (needs SUPABASE_URL + SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY)
        - Push notification every Saturday (needs deployment build)