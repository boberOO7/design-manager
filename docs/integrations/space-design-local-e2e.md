# SPACE DESIGN → StudioFlow: локальний E2E / WordPress Codex

Підготовлено 2026-11-08. Backend не переписувався: перевіряємо чинні
`202 accepted` / `200 already_accepted`, inbox і SQL-worker. Нова міграція SQL-worker застосовується окремо; HTTP-worker видалений.
Це підготовка приймача StudioFlow; плагін/CF7 у LocalWP ще потрібно перевірити
на стороні WordPress. Жодних production URL, ключів або remote DB.

## Дані підключення для WordPress Codex

| Параметр | Значення |
| --- | --- |
| `SD_STUDIOFLOW_BASE_URL` | `http://127.0.0.1:3100` |
| Endpoint | `http://127.0.0.1:3100/api/integrations/space-design/leads` |
| `SD_STUDIOFLOW_KEY_ID` | `space-design-e2e-local` |
| Dev-студія | `SPACE DESIGN E2E (local only)` |
| UUID dev-студії | `fbff564c-a7a5-47e2-a8ba-1b5783eaf439` |
| Приватний файл Windows | `C:\Users\USER\AppData\Local\StudioFlow\space-design-e2e\wordpress-private.php` |

Файл Windows уже створений поза web root. Його каталог має ACL лише для
поточного Windows-користувача, без успадкованих дозволів. Він містить лише
local BASE_URL, Key ID, тестовий `SD_STUDIOFLOW_HMAC_SECRET` і перемикач
`SD_STUDIOFLOW_SEND_ENABLED=false`. Worker/Supabase/production-секретів там немає.
Не друкувати файл через `cat`, `Get-Content`, tool read, debug або логи.

Підключити цей приватний файл у локальному `wp-config.php` до завантаження
WordPress і до наявних визначень `SD_STUDIOFLOW_*`, наприклад:

```php
require_once 'C:/Users/USER/AppData/Local/StudioFlow/space-design-e2e/wordpress-private.php';
```

Не дублювати вже визначені константи: замінити/підключити саме dev-конфігурацію.
Значення HMAC не потрібно копіювати в чат, промпт чи код плагіна.
На час погодженого тесту увімкнути SEND_ENABLED лише в цій Windows-копії,
після тесту знову вимкнути.

HTTP дозволений тут **лише для локального E2E loopback**. Якщо плагін вимагає
HTTPS або блокує приватні IP, дозволити конкретний origin
`http://127.0.0.1:3100` лише за `wp_get_environment_type() === 'local'`.
Не послаблювати production-валідацію URL, не вимикати SSL verification глобально
і не дозволяти довільні приватні адреси. Не створювати публічний тунель.

Перед CF7-тестом перевірити локальне перехоплення пошти, щоб не відправляти
реальні повідомлення. Використовувати синтетичні імена, `@example.test` email
і тестові телефони; не копіювати реальні контакти.

## Запуск StudioFlow у WSL2

З каталогу `/home/vasilios/work/design-manager`:

```bash
# Повторюваний local-only setup; існуючі тестові ключі не обертає.
node scripts/space-design-local.mjs prepare

# Залишити в окремому терміналі; слухає лише 127.0.0.1:3100.
node scripts/space-design-local.mjs start
```

Dev-server уже запущений під час підготовки; повторний start потрібен лише якщо
він зупиниться. Скрипт бере Supabase credentials із `supabase status` у пам'ять
і перевіряє точний URL `http://127.0.0.1:54321`. Він не читає `.env.prod` або
файл production-секретів. Документовані сторонні інтеграційні env обнуляються;
тестові SPACE DESIGN і локальні Supabase env явно перевизначають `.env.local`.
Існуючий `.env.local` не змінюється.

У `.env.space-design.e2e.local` з правами 0600 збережені лише нові dev-ключі,
Key ID і UUID тестової студії. Старий worker-secret у раніше створеному файлі
ігнорується й більше не генерується. Для WordPress використовувати окремий PHP-файл.
Усі файли конфігурації/секретів виключені з Git.

WSL-джерело приватної PHP-конфігурації:
`.local/space-design-e2e/wordpress-private.php`, права 0600.
Windows може читати його через
`\\wsl.localhost\Ubuntu\home\vasilios\work\design-manager\.local\space-design-e2e\wordpress-private.php`.
Якщо робити нову Windows-копію, зберігати лише в приватному каталозі з ACL
поточного користувача, не в LocalWP `app/public`.

Не зупиняти інші dev-сервери та не видаляти чужі `.next` locks. На момент
підготовки серверів/lock не було; порт 3100 був вільний у WSL і Windows.

## Worker і перевірка результату

Після відправлення форми у другому WSL-терміналі:

```bash
node scripts/space-design-local.mjs worker
node scripts/space-design-local.mjs status
```

WordPress Codex може запустити ті самі команди з Windows PowerShell:

```powershell
wsl.exe -d Ubuntu --cd /home/vasilios/work/design-manager bash -ic "node scripts/space-design-local.mjs worker"
wsl.exe -d Ubuntu --cd /home/vasilios/work/design-manager bash -ic "node scripts/space-design-local.mjs status"
```

`bash -ic` потрібен для наявного Node.js 22 через nvm; не використовувати тут
`bash -lc`, який у цьому Windows→WSL запуску вибирає старий системний Node.

Worker command виконує `select private.process_space_design_lead_jobs();`
через локальний Docker/psql. HTTP-запит і worker-secret не потрібні.
Вбудована перевірка відмовляється запускати глобальний worker, якщо є pending /
processing jobs інших студій. Студія також перевіряється за UUID та E2E-назвою.
Діагностика показує лише технічні статуси/UUID, без контактів чи payload.

Supabase cron `studioflow-space-design-leads-worker` залишено **inactive**.
Для цього E2E не потрібні Vault worker URL/secret, активація scheduler,
публічний ingress або Vercel. Worker викликається вручну наведеною командою.
Після HTTP `202` лід ще може бути pending; після worker очікується
`created` або `duplicate`. `200 already_accepted` — повтор події, а не доказ
контактного дубліката. Повний [API-контракт](space-design-wordpress-contract.md)
залишається чинним, окрім явно локального HTTP origin.

Тестова студія не додається до наявних користувачів: їхні membership/ролі
не змінюються. Результат перевіряється `status` і E2E-скриптом. CRM-ліди
ізольовані від звичайних студій та залишені як синтетичні dev-fixtures.

## Відтворювані перевірки

З WSL (створює лише синтетичні записи в E2E-студії):

```bash
node scripts/space-design-local.mjs test
```

З Windows PowerShell (також викликається з WSL через powershell.exe):

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "\\wsl.localhost\Ubuntu\home\vasilios\work\design-manager\scripts\test-space-design-windows.ps1"
```

Потім у WSL виконати `node scripts/space-design-local.mjs worker`.
Windows probe читає лише локальний private PHP-файл, підписує тестову заявку
в пам'яті та друкує лише receipt UUID / HTTP status. Він не змінює плагін,
не вмикає CF7 send flag і не замінює тест реального відправлення форми.

Повторний запуск setup зберігає ті самі ключі; повторний test створює нові
синтетичні події з власними UUID/контактами, не видаляючи WordPress-fixtures.
Не запускати автоматичний smoke одночасно з ручними CF7-перевірками.

## Перевірений результат

- Локальні Docker/Supabase API і DB працюють; застосовані об'єкти обох
  SPACE DESIGN migrations: inbox/key registry, accept/claim/complete/fail RPC,
  нормалізатори телефону/email. Для SQL-worker додана окрема міграція
  `20261108201252_space_design_sql_worker.sql`; публічні RLS/grants збережені.
- В історії snapshot немає записів двох SPACE DESIGN migrations, хоча об'єкти
  вже застосовані адресно у попередній роботі. Не використовували reset,
  `--include-all`, push або repair чужої історії; не застосовували SQL повторно.
- Next.js слухає `127.0.0.1:3100`. Windows також показує listener
  `127.0.0.1:3100`. HTTP-worker більше не існує; запуск обробки лише SQL.
- Справжній HTTP E2E: `202` приймання; `200` повтор / інший порядок JSON-ключів;
  `409` конфлікт; форми footer/modal і мови uk/en/pl.
- SQL-worker і CRM: 3 created, 2 duplicate за телефоном/email,
  phone-present не використовує email fallback; source `SPACE DESIGN Website`,
  status `new`, завершені payload очищені. Повтор завершеної події не створює job.
- Окрема підписана заявка **з Windows** через loopback → `202`; після worker
  створено синтетичний `new` CRM-лід із правильним source.
- Права backend збережені. service_role не має прямого SELECT до crm_leads;
  E2E-helper перевіряє лише власні синтетичні lead references через локальний
  Docker/psql, без зміни grants. Ніякі реальні контакти не читаються.

Мережевий підхід відповідає [документації Microsoft WSL networking](https://learn.microsoft.com/en-us/windows/wsl/networking):
Windows звертається до Linux-сервера через localhost. Firewall, portproxy,
мережевий режим WSL і публічні тунелі не змінювалися.
