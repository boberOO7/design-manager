# SPACE DESIGN → StudioFlow: production readiness

Перевірено 2026-11-08 приблизно о 18:05 Europe/Kyiv. Це read-only аудит і
пропозиція налаштувань; production-зміни нижче **не виконані**.
WordPress 1.1.0 та його локальні тести прийняті з повідомлення користувача;
production WordPress не відкривався, реальні форми не надсилалися.

## Встановлений production target

- Сайт: `https://studio-flow.space`.
- Публічний JS фактичної `/login` сторінки містить Supabase ref
  `znzarmgdhddwuxzgvchq`. Це збігається з локальним `.env.prod` і linked ref.
- Supabase project названий `studioflow-development`, але саме його використовує
  поточний production сайт. Статус проєкту `ACTIVE_HEALTHY`, Postgres 17.
- Єдина студія: `SPACE`, UUID `c5a5250b-6ac6-4227-94ff-44f713b70c69`.
  Тестова local-only студія та dev-ключі тут не використовуються.

## Фактичний стан

| Перевірка | Production | Локальний код |
| --- | --- | --- |
| `POST /api/integrations/space-design/leads` без підпису, тіло `{}` | HTTP **200**, `text/html`, `x-matched-path=/_not-found`; це не приймання заявки | Є strict JSON/HMAC endpoint; для такого запиту очікується JSON 401 |
| `HEAD /api/integrations/space-design/worker` без bearer | **404**, `/_not-found` | Є bearer-protected GET worker; без авторизації JSON 401 |
| Нові міграції | Обидві відсутні в migration history | Два підготовлені SQL-файли |
| `space_design_integration_keys`, `space_design_lead_jobs` | Відсутні | Є schema/RLS/grants |
| accept/claim/complete/fail RPC, SPACE phone normalizer і dispatcher | Відсутні | Реалізовані |
| Key ID → studio | Реєстру немає; прив'язки немає | Можна зареєструвати після міграції |
| `SPACE_DESIGN_KEY_ID` у Vercel | Користувач підтвердив: **не задане** | Dev Key ID існує лише локально |
| HMAC і worker env у Vercel | Додані за повідомленням користувача; незалежно не перевірені | Сервер очікує обидва env |
| `SPACE_DESIGN_CRM_STUDIO_ID` у Vercel | Не звірено | Має бути production SPACE UUID вище |
| Vault `studioflow_space_design_worker_secret` | Є, значення непорожнє; відповідність Vercel не перевірена | Очікується той самий worker-secret |
| Vault `studioflow_space_design_worker_url` | Відсутній | Потрібний чинному HTTP dispatcher |
| Cron `studioflow-space-design-leads-worker` | Відсутній, а не просто inactive | Міграція створює inactive job раз на хвилину |
| pg_cron, pg_net, Vault, чинний CRM phone helper/trigger | Є | Наявні залежності можна повторно використати |

Доступ до GitHub repo підтверджено; файл endpoint відсутній у default `main`
(Contents API 404). Локальні integration routes/lib/migrations наразі untracked.
Їхня наявність у workspace не означає deployment у Vercel.

Production HTTP probes не містили підпису/секретів, submission UUID або контактів.
Виклик автентифікованого worker, enqueue/claim/complete/fail RPC чи scheduler
dispatch **не виконувався**, оскільки вони можуть змінити production CRM.
SQL-перевірки виконано в read-only транзакціях; секрети не поверталися в результатах.

## Доступ і невизначеності

Підключені Supabase і GitHub дозволили перевірити БД і наявність route у main.
Прямого доступу до Vercel зараз немає; Vercel integration запропоновано підключити.
До підтвердженого підключення не можна стверджувати, що переглянуто поточні
Production env, deployment SHA/status або відповідність worker-secret між
Vercel і Vault. Нові секрети не потрібні й не генерувалися.

## Конкретний план для погодження

1. **Vercel configuration**, зі збереженням уже доданих секретів:

   ```text
   SPACE_DESIGN_KEY_ID=space-design-prod
   SPACE_DESIGN_CRM_STUDIO_ID=c5a5250b-6ac6-4227-94ff-44f713b70c69
   SPACE_DESIGN_HMAC_SECRET=<існуюче значення, не змінювати>
   SPACE_DESIGN_WORKER_SECRET=<існуюче значення, має збігатися з Vault>
   ```

   `space-design-prod` — запропонований новий не секретний Key ID, не вже
   застосоване налаштування. Scope — Production. Перевірити, що застосунок
   використовує Supabase ref `znzarmgdhddwuxzgvchq` і має свій чинний server-only
   Supabase secret для інтеграційних RPC. Не копіювати dev або WordPress ключі.

2. **Погодити, закомітити та розгорнути backend integration** у Vercel.
   Route files, `src/lib/space-design`, proxy exceptions і generated public types
   повинні потрапити в deployment. Секретні `.env*` та `.local` не комітити.
   Переконатися, що новий deployment містить Production env. WordPress sending
   лишається disabled до завершення решти налаштувань.

3. **Застосувати лише дві перевірені міграції у production, у порядку:**

   - `supabase/migrations/20261107205223_space_design_lead_inbox.sql`
   - `supabase/migrations/20261107205818_space_design_national_phone.sql`

   Вони створять inbox/key registry, grants/RLS, RPC, email/contact-write
   coordination і **inactive** Cron job. Вони не створюють CRM лідів,
   інтеграційних ключів або нових секретів. Не запускати широкий db push /
   include-all, не редагувати існуючі міграції. Зареєструвати міграції в історії
   цільової БД штатним migration workflow.

4. **Після окремого погодження виконати**
   [конкретний SQL конфігурації](../../scripts/space-design-production-configure.sql).
   Він реєструє `space-design-prod` → production SPACE UUID і додає відсутній
   Vault URL `https://studio-flow.space/api/integrations/space-design/worker`.
   Існуючий worker-secret не змінює; Cron не активує. Наявний key з іншою
   студією/disabled-станом або конфліктний URL спричинить rollback, не перезапис.

5. **Безпечна перевірка deployment/config** до активації:
   unsigned JSON POST на leads повинен дати JSON 401; unsigned HEAD worker —
   JSON 401. HTML 200, redirect або 404 не є успіхом інтеграції.
   Перевірити чотири server env, key registry, Vault URL і відповідність
   worker-secret без відображення значень. Worker URL не повинен вимагати
   інтерактивного Vercel login або повертати redirect.

6. **Після окремого погодження активувати автоматичну обробку** через
   [SQL активації](../../scripts/space-design-production-activate.sql).
   Він перевіряє key/studio, Vault URL/наявний secret та очікуваний command і
   schedule, потім активує лише `studioflow-space-design-leads-worker`.
   Без цього accepted заявки накопичуватимуться в inbox без автоматичної обробки.

## WordPress 1.1.0

Плагін уже можна встановлювати/налаштовувати з
`SD_STUDIOFLOW_SEND_ENABLED=false`, але **передавання зараз не вмикати**.

```text
SD_STUDIOFLOW_BASE_URL=https://studio-flow.space
SD_STUDIOFLOW_KEY_ID=space-design-prod
SD_STUDIOFLOW_HMAC_SECRET=<той самий існуючий production HMAC із Vercel>
```

Key ID вище набуває чинності лише після погодженого налаштування обох сторін
і registry. Worker-secret/worker URL/Supabase service key WordPress не потрібні.
HTTP 202 означає лише durable acceptance. HTTP 200 має містити погоджений JSON
receipt із правильним submission_id; поточний HTML 200 не можна приймати за успіх.

## Перевірка доставки після запуску

Після погодженого запуску перевірити одну контрольовану синтетичну подію
(це окрема write-перевірка, у цьому аудиті не виконувалась):

1. Отримати від endpoint `202` і погоджений JSON із submission_id.
2. У WordPress outbox перевірити підтвердження доставки цього UUID.
3. У Supabase переглянути лише технічний стан цього UUID у
   `space_design_lead_jobs`: спершу pending, потім created/duplicate; для created
   буде crm_lead_id, attempts і completed_at, payload очищений.
4. Перевірити `cron.job` active та `cron.job_run_details` для потрібного job ID.
   Cron SQL success означає dispatch, а не HTTP success чи створений лід:
   окремо перевірити HTTP status pg_net response і стан конкретного inbox UUID.
   HTTP 401 worker означає насамперед необхідність звірити worker-secret;
   404/HTML/redirect — deployment/URL/protection issue.
5. Для created перевірити CRM Lead у студії SPACE: status `new`,
   source `SPACE DESIGN Website`. Повтор того самого event UUID має дати
   `200 already_accepted` і не створити другий lead.

Потім можна виконати контрольовані phone/email duplicate сценарії. Реальні
клієнтські заявки для перевірки не потрібні. Не дампити Vault, Vercel env,
raw payload або контакти в звіти/логи. Погодити видалення синтетичних fixtures
окремо, зберігши ідемпотентність event tombstones, якщо їх лишають для діагностики.

## Вимкнення / rollback

Спочатку вимкнути WordPress sending. Для паузи worker після окремого погодження:

```sql
select cron.alter_job(jobid,active:=false)
from cron.job where jobname='studioflow-space-design-leads-worker';
```

Не видаляти inbox/tombstones або ключі як спосіб rollback: це може втратити
прийняті події та захист від повторів. Pending jobs зберігаються для відновлення.
