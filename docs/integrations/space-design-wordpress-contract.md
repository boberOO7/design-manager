# SPACE DESIGN → StudioFlow: контракт для WordPress Codex

## Межа відповідальності

WordPress/Contact Form 7 працює в іншому середовищі. StudioFlow не звертається
до WordPress. Інтеграція викликається лише сервером WordPress; секрети ніколи
не потрапляють у JavaScript, HTML, браузерні запити або журнали.

Endpoint: `POST https://<STUDIOFLOW_HOST>/api/integrations/space-design/leads`.
Використовувати HTTPS із перевіркою сертифіката. Локальні тести допускають HTTP.
URL хоста й ключі передаються оператором окремо; production ще не налаштовано.

## JSON v1

`Content-Type: application/json; charset=utf-8`. Максимум 16 384 байти UTF-8.
Усі наведені поля обов'язкові; зайві поля відхиляються.

```json
{
  "schema_version": 1,
  "submission_id": "dd942f80-1dc3-4f43-8db3-35e054adcd68",
  "submitted_at": "2026-11-07T12:00:00Z",
  "form_id": 7153,
  "form_location": "modal",
  "language": "uk",
  "page_url": "https://example.test/contact/",
  "client_name": "Тестова заявка",
  "phone": "050 123 45 67",
  "email": null
}
```

| Поле | Правило |
| --- | --- |
| `schema_version` | Число `1` |
| `submission_id` | UUID; генерується один раз для фактичної заявки, повтори використовують той самий UUID |
| `submitted_at` | ISO 8601 з `Z` або часовим зміщенням; час первинної заявки, зберігається при повторі |
| `form_id` / `form_location` | Число `3032` + `footer`, або число `7153` + `modal` |
| `language` | `uk`, `en`, `pl` |
| `page_url` | Абсолютний HTTP(S) URL, до 2000 символів, без username/password; не додавати контакти в URL |
| `client_name` | Непорожній після trim рядок, 1–200 символів; не вигадувати ім'я за відсутності введеного |
| `phone` | `null` або непорожній після trim рядок до 80 символів; цифри й оформлення `+ ( ) . - пробіл`, `+` лише на початку; 7–15 цифр після видалення початкового `00` |
| `email` | `null` або коректний email до 320 символів після trim; CRM зберігає нижній регістр |

Потрібен телефон **або** email, можна обидва. Порожній контакт передавати як
`null`, не як `""`. Якщо контакт введений, але невалідний, виправити його;
не приховувати помилку видаленням поля. Передавати справжню мову сторінки та
URL; StudioFlow не завантажує `page_url`.

## Підпис і заголовки

| Заголовок | Значення |
| --- | --- |
| `X-SD-Key-Id` | Узгоджений ідентифікатор ключа, `[A-Za-z0-9_-]{1,80}` |
| `X-SD-Timestamp` | Поточний Unix timestamp у **секундах**, 10 десяткових цифр |
| `Idempotency-Key` | Той самий UUID, що й `submission_id` |
| `X-SD-Signature` | `sha256=` + 64 символи lowercase hex |

Вхідні байти для HMAC-SHA256:

```text
timestamp + "\nPOST\n/api/integrations/space-design/leads\n" + rawBody
```

Тут `\n` означає один байт LF, без CR. `rawBody` — точні UTF-8 байти тіла
HTTP-запиту. Кінцевий LF додавати лише якщо він є частиною `rawBody`.
Хост і query string не входять у підпис; шлях завжди точний, без кінцевого `/`.
Не змінювати JSON після підписання.

Секрет — 64 lowercase hex-символи, що кодують 32 випадкові байти. **В HMAC
використовувати сам текст секрету, без `hex2bin` / base64-декодування.**
Ідентифікатор ключа прив'язаний до студії на сервері й у базі; студію не
передавати в payload. Supabase API key / service key WordPress не потрібен.

Timestamp допускає відхилення до ±300 секунд включно. Синхронізувати годинник
WordPress. Для повтору через кілька хвилин оновлювати timestamp і підпис,
зберігаючи UUID та початковий payload (найпростіше — збережені байти JSON).
Ідемпотентність не залежить від пробілів і порядку JSON-ключів; digest
обчислюється після trim полів / lowercase email та UUID у фіксованому порядку.
Зміна значень полів конфліктує. Повтор у межах вікна теж безпечний:
durable tombstone не дозволяє повторно створити лід. Повтор зі старим timestamp
відхиляється навіть для вже прийнятого UUID.

Приклад підписання PHP (транспорт викликати у серверному worker WordPress):

```php
$path = '/api/integrations/space-design/leads';
$timestamp = (string) time();
// $raw_body збережений у WordPress outbox при створенні заявки.
$signature = 'sha256=' . hash_hmac(
    'sha256', $timestamp . "\nPOST\n" . $path . "\n" . $raw_body,
    SD_STUDIOFLOW_HMAC_SECRET
);
$response = wp_remote_post(SD_STUDIOFLOW_BASE_URL . $path, [
    'timeout' => 15,
    'redirection' => 0,
    'sslverify' => true,
    'headers' => [
        'Content-Type' => 'application/json; charset=utf-8',
        'X-SD-Key-Id' => SD_STUDIOFLOW_KEY_ID,
        'X-SD-Timestamp' => $timestamp,
        'Idempotency-Key' => $submission_id,
        'X-SD-Signature' => $signature,
    ],
    'body' => $raw_body,
]);
```

## Відповіді й повтори

Усі відповіді JSON, `Cache-Control: no-store`; контактів чи внутрішніх помилок
у відповідях немає. Відповідь не містить CRM lead ID і не розкриває збіги контактів.

| HTTP | JSON | Дія WordPress |
| --- | --- | --- |
| `202` | `{"submission_id":"…","status":"accepted"}` | Надійно записано в inbox, завершити доставку |
| `200` | `{"submission_id":"…","status":"already_accepted"}` | Раніше прийнято, завершити доставку |
| `400` | `{"error":"invalid_payload"}` | Виправити payload / Idempotency-Key, не повторювати незмінний невалідний запит |
| `401` | `{"error":"unauthorized"}` | Перевірити ключ, секрет, підпис і годинник |
| `409` | `{"error":"idempotency_conflict"}` | Цей UUID уже прив'язаний до інших значень payload; перевірити збережене первинне тіло |
| `413` | `{"error":"payload_too_large"}` | Зменшити тіло |
| `415` | `{"error":"unsupported_media_type"}` | Виправити Content-Type |
| `429` | `{"error":"rate_limited"}` | Повторити з тим самим UUID/тілом, врахувати `Retry-After: 60` |
| `503` | `{"error":"temporarily_unavailable"}` | Повторити з тим самим UUID/тілом, врахувати `Retry-After: 60` |

`202` / `200` означає завершення **доставки**, а не гарантоване створення нового
CRM-ліда: worker може визначити дублікат або зафіксувати помилку. Новий UUID
не можна генерувати лише через timeout, втрату відповіді або retry.

Для CF7 обробляти лише підтверджені валідні відправлення форм 3032 / 7153;
не відправляти invalid/spam/abort events. Зберігати UUID, початковий timestamp
заявки та серіалізоване тіло в durable outbox WordPress до підтвердження
`202`/`200`. Дубльований hook для однієї фактичної заявки має використати
ту саму outbox-подію. Використовувати фонові повтори з backoff для network
errors / timeout / `429` / `5xx`; не блокувати форму надовго. Невизначена
відповідь або втрачена відповідь теж потребує повтору того самого event.
Не логувати секрет, підпис чи повний payload.

## Дедуплікація в CRM

Новий лід: `status = new`, `source = SPACE DESIGN Website`. Порівняння лише
в межах прив'язаної студії, з усіма чинними CRM-лідами незалежно від джерела
та статусу. Видаляється оформлення телефону, початковий `00`; для локального
українського `0XXXXXXXXX` додається `38`. Явні міжнародні країни зберігаються.
Для існуючих CRM-контактів враховується явна країна за чинним правилом CRM.
Неоднозначні дев'ятизначні номери без країни не отримують автоматичного `380`;
WordPress бажано приводити такі номери до міжнародного запису через вибір країни.

За наявності телефону порівнюється лише телефон. Лише за відсутності телефону
порівнюється email після trim/lowercase. Збіг не змінює та не доповнює наявний
лід. Повтор UUID залишається ідемпотентним і після видалення CRM-ліда.
