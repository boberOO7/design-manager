# SPACE DESIGN → StudioFlow: production rollout після спрощення

## Виконано на production 2026-11-09

За прямим погодженням користувача виконано обидва оновлені operational SQL:
`space-design-prod` зареєстрований/enabled для SPACE
`c5a5250b-6ac6-4227-94ff-44f713b70c69`; job 25866
`studioflow-space-design-leads-worker` активний, `* * * * *`, викликає тільки
`private.process_space_design_lead_jobs()`. Автоматичний запуск о 01:32
Europe/Kyiv має status `succeeded`. Усі три міграції підтверджені в production,
старий HTTP-dispatcher відсутній. Черга порожня; тестових/клієнтських лідів
під час налаштування не створювали, секрети не змінювали.

Приймач уже розгорнутий, але unsigned JSON POST `{}` повертає JSON 503
`temporarily_unavailable`, а не очікуваний 401. У чинному endpoint конфігурація
Key ID/studio/HMAC перевіряється перед перевіркою підпису й перед доступом до БД;
потрібно звірити ці три Production env у Vercel та deployment після їх зміни.
Наявність конкретного некоректного env без прямого доступу до Vercel не доведена.
WordPress sending залишати вимкненим до усунення 503.

Нижче — збережений план rollout від 2026-11-08; кроки реєстрації ключа й
активації Cron вже виконані, повторювати їх не потрібно.

Оновлено 2026-11-08. Це план для погодження; нова міграція застосована лише
локально. Production, ключі, Vault і Cron цією зміною не модифікувалися.

## Поточна архітектура

`WordPress → signed POST → durable inbox → Supabase Cron → private SQL-worker → CRM`.

`private.process_space_design_lead_jobs()` обробляє batch із 5 jobs, використовуючи
чинні lease/atomic completion/failure RPC. Кожна job має окремий exception block:
CRM-помилка не скасовує здорові jobs. HTTP-worker видалений. Його URL, worker-secret
та відповідні Vault-записи більше не використовуються. Meta/Web Push не змінені.

Контракт WordPress 1.1.0 незмінний: endpoint і HMAC-підпис ті самі, `202 accepted`,
`200 already_accepted`, `409 idempotency_conflict`. Новий JSON 200/201 не вводиться.

## Що вже було перевірено на production

Останній read-only аудит перед цією зміною (2026-11-08, 18:31 Europe/Kyiv):

- `https://studio-flow.space` використовує Supabase `znzarmgdhddwuxzgvchq`
  (project name `studioflow-development`; це не показник призначення середовища).
- Студія `SPACE`: `c5a5250b-6ac6-4227-94ff-44f713b70c69`.
- Міграції `20261107205223_space_design_lead_inbox` і
  `20261107205818_space_design_national_phone` застосовані; inbox/registry є.
- Реєстр ключів і inbox були порожні; Cron існував, але був inactive і ще
  викликав старий HTTP-dispatcher. Worker-secret у Vault був доданий користувачем.
- Endpoint на основному домені тоді повертав HTML `/_not-found` замість JSON,
  HTTP-worker — 404. Після наступних deployment ці дані треба перевірити знову.
- Наявність production HMAC/env Vercel повідомлена користувачем; їхні значення
  не виводилися і не звірялися через Vercel API.

Локальний commit/наявність функції не доводить її застосування на production.
Це оновлення **не є новим production readiness audit**.

## План для окремого погодження

1. Перевірити Production env Vercel, зберігши наявний HMAC:

   ```text
   SPACE_DESIGN_KEY_ID=space-design-prod
   SPACE_DESIGN_CRM_STUDIO_ID=c5a5250b-6ac6-4227-94ff-44f713b70c69
   SPACE_DESIGN_HMAC_SECRET=<існуюче значення, не генерувати заново>
   ```

   WordPress використовує той самий Key ID/HMAC. UUID студії WordPress не потрібен.
   Наявний server-only Supabase client застосунку має вказувати на правильний
   production project. `SPACE_DESIGN_WORKER_SECRET` більше не потрібен.

2. Погодити й застосувати **тільки нову** міграцію:
   `supabase/migrations/20261108201252_space_design_sql_worker.sql`.
   Дві попередні міграції повторно не застосовувати. Нова створює private worker,
   замінює Cron command на `select private.process_space_design_lead_jobs();`,
   видаляє HTTP-dispatcher і залишає job **inactive**. Дані inbox/CRM, ключі,
   секрети та shared extensions не видаляються. Public generated DB contract
   не змінюється. Не запускати широкий push/include-all чужих міграцій.

3. Погодити commit/push/deployment зміненого застосунку. Вхідний endpoint сумісний
   з попередньою схемою inbox; після нової міграції обробка не залежить від Vercel
   worker endpoint. Старий HTTP-worker route видалено.

4. Після погодження виконати
   [SQL конфігурації](../../scripts/space-design-production-configure.sql).
   Він тепер **лише** реєструє `space-design-prod` → SPACE UUID; не читає Vault,
   не створює секретів, не активує Cron. Конфліктний або revoked key не перезаписує.
   Якщо ключ уже зареєстрований правильно, виконання ідемпотентне.

5. Перевірити приймач: unsigned JSON POST `{}` на
   `https://studio-flow.space/api/integrations/space-design/leads` має дати JSON 401.
   HTML 200/redirect/404 не є прийманням. Перевірити registry binding і три env.
   HTTP-worker більше не має health endpoint; він не використовується.

6. Після погодження виконати
   [SQL активації](../../scripts/space-design-production-activate.sql).
   Він перевіряє key/studio, наявність SQL-worker і точний Cron command/schedule,
   потім вмикає лише `studioflow-space-design-leads-worker` раз на хвилину.
   Vault URL/secret не додаються й не перевіряються.

7. Після окремого погодження write-перевірки надіслати одну синтетичну подію,
   дочекатися чергового Cron tick і перевірити її UUID:
   WordPress receipt `202` → inbox `created`/`duplicate` → CRM для `created`.
   Source `SPACE DESIGN Website`, status `new`, payload успішної job очищений.
   Повтор того самого UUID має дати `200 already_accepted`, без другого ліда.
   Далі можна вмикати WordPress sending. Реальних контактів для тесту не потрібно.

## WordPress і секрети

Плагін можна налаштовувати з `SD_STUDIOFLOW_SEND_ENABLED=false`:

```text
SD_STUDIOFLOW_BASE_URL=https://studio-flow.space
SD_STUDIOFLOW_KEY_ID=space-design-prod
SD_STUDIOFLOW_HMAC_SECRET=<існуючий спільний HMAC>
```

WordPress не отримує Supabase або worker credentials. Старі
`studioflow_space_design_worker_secret`, `studioflow_space_design_worker_url`
у Vault та `SPACE_DESIGN_WORKER_SECRET` у Vercel можна залишити на час rollout:
новий код їх не читає. Їх видалення не є передумовою запуску, не робити його
автоматично разом із міграцією. Не змінювати secrets Meta/Web Push.

## Діагностика й пауза

Перевіряти `cron.job` active/command і `cron.job_run_details` саме для цього job,
а також технічний status/attempts/last_error конкретного inbox submission UUID.
SQL-worker повертає лише лічильники; не дампити payload, Vault або Vercel env.
Немає pg_net HTTP-відповідей чи залежності від доступності worker у Vercel.

Після погодження паузи:

```sql
select cron.alter_job(jobid,active:=false)
from cron.job where jobname='studioflow-space-design-leads-worker';
```

Зупинити WordPress sending, не видаляти прийнятий inbox/tombstones. Вони потрібні
для відновлення й захисту від повторів. Один SQL-worker підтримує jobs різних
студій, але приймач зараз має один env Key ID/HMAC/studio на deployment;
підключення багатьох незалежних сайтів потребує окремої зміни key resolver.
