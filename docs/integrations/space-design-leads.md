# SPACE DESIGN Website → CRM Leads

Реалізація server-to-server приймання CF7 3032/footer і 7153/modal.
[Точний контракт для WordPress Codex](space-design-wordpress-contract.md).
[Підготовлене локальне E2E-середовище Windows LocalWP ↔ WSL2](space-design-local-e2e.md).

## Потік і межі доступу

`POST /api/integrations/space-design/leads` перевіряє ліміт 16 KiB, HMAC над
сирими байтами, timestamp ±5 хвилин, strict JSON v1 та рівність
Idempotency-Key/submission_id. Ключ і секрет беруться лише із server env.
`accept_space_design_lead` атомарно перевіряє registry key → studio / enabled,
спільний для всіх інстансів rate limit і записує inbox. Лише підтверджений
запис повертає `202`; збій до/після невизначеного commit повертає `503`, а
повтор безпечно з'ясовує факт попереднього прийняття. Digest — SHA-256 JSON
валідованих полів у фіксованому порядку після trim/нормалізації email і UUID.
Пробіли та порядок JSON-ключів не створюють конфлікт; зміна значень дає `409`.
HMAC завжди перевіряється над точними сирими байтами отриманого запиту.

`GET /api/integrations/space-design/worker` має незалежний bearer secret.
`processSpaceDesignQueue` через RPC бере до 5 job, максимум RPC 10,
`FOR UPDATE SKIP LOCKED`. Lease-token змінюється при recovery через 5 хвилин;
застарілий worker не може завершити/зіпсувати перевидані job. Максимум 8 спроб,
backoff 30 секунд × 2^(attempt−1), максимум 3600 секунд, як у Meta.
Недоступність worker/DB не втрачає inbox: спрацює наступний scheduler tick або
recovery lease. Результат невдало збереженого completion з'ясовується наступним
викликом; атомарна транзакція й lease не допускають повторного CRM insert.

`complete_space_design_lead` бере студію/контакти з inbox, а не з аргументів
довільного payload worker. Перевірка дублікату, CRM insert і технічний результат
відбуваються в одній транзакції. Використовується існуюче студійне advisory
блокування `studioflow:crm_lead_phone:<studio UUID>`; новий trigger додає до
нього ручні **email edits**. Чинні INSERT/phone edits уже беруть це блокування.
Meta endpoint, RPC, mapping і scheduler не змінені. Індекси покривають студію
та нормалізовані контакти. Existing CRM RLS і lifecycle history залишаються межею
доступу та журналом створення; автоматичний імпорт не вигадує assignee.

Перший контакт — дата `submitted_at` у `Europe/Kyiv`, за чинним Meta-підходом.
Телефон/email дедуплікуються за [контрактом](space-design-wordpress-contract.md).
Одночасні нові submissions з однаковим контактом дають один створений лід.
Дублікат не змінює наявний контакт.

## Схема, діагностика, персональні дані

- `space_design_integration_keys`: реєстр ключів без HMAC-секретів, studio,
  enabled і fixed rate window; типовий ліміт 60 автентифікованих валідних
  запитів/хвилину на ключ, налаштовується оператором через `requests_per_minute`.
  Ліміт включає повтори/конфлікти; неавторизовані запити не можуть витратити його.
- `space_design_lead_jobs`: PK `(studio_id,submission_id)`, digest, тимчасовий
  payload, статус, lease, attempts/backoff, CRM reference та технічний error code.
  Ключі однієї студії поділяють idempotency namespace; ротація не створює дублікати.
- Таблиці мають RLS і не мають grants/policies для anon/authenticated.
  Inbox RPC доступні лише service_role; completion — обмежений security-definer
  RPC із порожнім search_path. Секрет/підпис у базі не зберігаються.
- `created` і `duplicate` очищають payload. Залишаються лише технічні дані,
  digest і reference для created. CRM deletion зануляє reference, tombstone
  залишається й не дозволяє відновити лід повторною доставкою.
- `pending`/`processing` і terminal `failed` зберігають одну копію початкових
  даних для відновлення/розбору. У діагностиці лише `crm_write_failed` або
  `lease_exhausted`; помилки Supabase, контакти, body та секрети не логуються.
  Failed payload можна вручну очистити після розбору; tombstone не видаляти.
- Повтор прийнятої failed-події повертає `200`, не скидає attempts і не запускає
  нескінченні retry. Для ручного повтору після виправлення причини оператор може
  явно повернути failed job у `pending`, скинути attempts/lease/error/completed_at
  і встановити available_at=now(); перед цим перевірити наявність payload.

Діагностика без контактів (виконувати лише оператором на локальній/dev БД):

```sql
select studio_id,submission_id,key_id,status,attempts,last_error,
       received_at,available_at,completed_at,crm_lead_id
from public.space_design_lead_jobs
order by received_at desc;
```

## Запуск лише локально/dev

1. Підняти звичайний локальний Supabase проєкту. Не використовувати linked,
   remote URL, `.env.prod`, db push або db reset для цих перевірок.
2. Застосувати нові міграції через `DO_NOT_TRACK=1 pnpm exec supabase migration up --local`.
   Якщо історія локального snapshot має сторонні пропуски, не застосовувати
   `--include-all`: виконати лише ці два нові файли один раз, у порядку,
   на **локальному** контейнері. Це не ремонтує/не змінює migration history:

   ```bash
   docker exec -i supabase_db_design-manager psql -U postgres -d postgres -v ON_ERROR_STOP=1 -1 < supabase/migrations/20261107205223_space_design_lead_inbox.sql
   docker exec -i supabase_db_design-manager psql -U postgres -d postgres -v ON_ERROR_STOP=1 -1 < supabase/migrations/20261107205818_space_design_national_phone.sql
   ```

3. В `.env.local` вказати звичайні **локальні** NEXT_PUBLIC_SUPABASE_URL та
   SUPABASE_SECRET_KEY, `SPACE_DESIGN_KEY_ID=space-design-dev`,
   `SPACE_DESIGN_CRM_STUDIO_ID=<dev studio UUID>`. Згенерувати два незалежні
   секрети командою `openssl rand -hex 32`: SPACE_DESIGN_HMAC_SECRET і
   SPACE_DESIGN_WORKER_SECRET. Не комітити їх. WordPress знає лише перший секрет
   і key ID. Реальні секрети/ключі/студія цією реалізацією не налаштовувалися.
4. Зареєструвати ключ у локальній/dev базі (студія має вже існувати):

   ```sql
   insert into public.space_design_integration_keys(key_id,studio_id)
   values ('space-design-dev','<dev studio UUID>');
   ```

5. Запустити `pnpm dev`. Надіслати синтетичну заявку за контрактом; worker
   викликати вручну з `Authorization: Bearer <SPACE_DESIGN_WORKER_SECRET>` на
   `GET http://localhost:3000/api/integrations/space-design/worker`.
   Endpoint не запускає ненадійний fire-and-forget імпорт; необхідний worker.
6. Після зміни public DB-контракту типи генеруються лише з локальної бази:
   `DO_NOT_TRACK=1 pnpm exec supabase gen types --local > src/types/database.types.ts`.

На ingress налаштовується загальний захист від неавтентифікованого HTTP flood;
вбудований DB rate limit захищає приймання автентифікованих заявок і працює
між усіма server instances. Невідомі ключі/підписи відхиляються до доступу до DB.

## Scheduler, без активації в цій задачі

Міграція додає **inactive** pg_cron job `studioflow-space-design-leads-worker`
(`* * * * *`). Він викликає private dispatch → pg_net GET → worker.
Meta job і CRON_SECRET не використовуються/не змінюються. Vault:

- `studioflow_space_design_worker_url`: точний HTTPS URL
  `https://<dev-host>/api/integrations/space-design/worker`;
- `studioflow_space_design_worker_secret`: той самий SPACE_DESIGN_WORKER_SECRET.

Після окремого дозволу оператора для цільового dev-середовища:

```sql
select vault.create_secret('https://<dev-host>/api/integrations/space-design/worker','studioflow_space_design_worker_url');
select vault.create_secret('<SPACE_DESIGN_WORKER_SECRET>','studioflow_space_design_worker_secret');
select cron.alter_job(jobid,active:=true) from cron.job where jobname='studioflow-space-design-leads-worker';
```

Для локального HTTP використати ручний виклик worker; dispatch свідомо вимагає
HTTPS. Disabled key блокує нове приймання; вже прийняті jobs продовжують
оброблятися. Це зберігає гарантію доставки раніше прийнятого inbox.

## Автоматизовані перевірки

```bash
pnpm exec vitest run src/lib/space-design
DO_NOT_TRACK=1 pnpm exec supabase test db --local supabase/tests/space_design_leads.test.sql
SPACE_DESIGN_LOCAL_DB_TESTS=1 DO_NOT_TRACK=1 pnpm exec vitest run supabase/tests/space_design_concurrency.test.ts
pnpm exec tsc --noEmit
```

SQL suite працює в rollback-транзакції. Concurrency suite opt-in, використовує
лише `supabase_db_design-manager`, синтетичну студію з випадковим UUID і видаляє
свої дані. Повний pipeline викликає route handler без нового Next dev server,
але використовує справжній **локальний** PostgREST/service role, inbox, worker
і CRM insert. URL перевіряється на localhost/127.0.0.1:54321; локальні ключі
зчитуються зі status в пам'ять, не друкуються.

Покриття: HMAC/raw bytes/verb/path, timestamp/future/stale, malformed JSON,
contract/tenant injection, payload cap, key binding/revocation, rate limit,
idempotency/conflict, phone та email fallback, cross-tenant RLS, lead source/status,
lifecycle history, lease fencing/recovery/exhaustion, API outage, atomic rollback,
PII cleanup/tombstone, одночасні deliveries/claims/completions, ручні phone insert
та email edit і наскрізне створення CRM lead.

Під час реалізації SQL-файли застосовано напряму лише до local DB через сторонні
пропуски migration history. Production, remote DB, WordPress, deploy і push не
використовувалися. Scheduler залишено вимкненим; тестуються лише синтетичні ліди.

Результат локальних перевірок 2026-11-07:

- SPACE DESIGN unit/endpoint/worker: 38 тестів пройшли.
- SPACE DESIGN concurrency та повний pipeline: 7 тестів пройшли.
- SPACE DESIGN pgTAP: 59 перевірок пройшли.
- Вузькі Meta регресії: 14 unit/endpoint, 2 concurrency та 63 pgTAP пройшли.
- `pnpm exec tsc --noEmit` і `git diff --check` пройшли.

Не запускалися production build, повні репозиторні suites, browser/E2E або
реальний WordPress. Автоматична активація scheduler та видача реальних ключів
не виконувалися; вони потребують конфігурації конкретного dev-середовища.
