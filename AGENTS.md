# AGENTS.md — журнал изменений и знаний агента

Перед каждой задачей перечитывать этот файл, чтобы не повторять ошибок и знать верный путь.

## Проект

- Nuxt 3 + Vue 3 + Tailwind CSS 3 + Pinia + Drizzle ORM (libSQL) + i18n
- Monorepo: корневой `package.json` (prettier для docs), основной код в `src/`
- Пакетный менеджер: pnpm@10.19.0 (`packageManager` зафиксирован)
- Сборка через Docker (`docker build -t awg-easy .`)
- Репозиторий: github.com/fast-iq/awg-easy (форк evoll/awg-easy)

## Команды

| Команда | Назначение |
|---|---|
| `pnpm install` (в `src/`) | установка зависимостей |
| `pnpm typecheck` | nuxt typecheck (vue-tsc) |
| `pnpm lint` | eslint . |
| `pnpm format:check` / `pnpm format` | prettier check/write |
| `pnpm build` | nuxt build + cli:build (esbuild) |
| `pnpm check:all` | typecheck + lint + format:check + build |

## Правила

- **Всегда обновлять AGENTS.md при внесении изменений в код** — это журнал: что сделано, как и почему. Перед каждой задачей перечитывать этот файл, чтобы знать что работает / что сломано / как чинить.
- Никогда не коммитить без явной просьбы.
- Не обновлять мажорные версии зависимостей без проверки совместимости (особенно nuxt, drizzle-orm, zod).
- `vue: "latest"` в package.json — фиксировать на конкретную версию при обновлениях.
- pnpm override: `rollup: 4.50.0` — не удалять без проверки сборки.
- Node.js не установлен локально (win32) — typecheck/lint/build можно запускать только в Docker или CI. Проверять изменения статически и через GitHub Actions.

## Успешные изменения

### 2026-09-26: аудит проекта + безопасные фиксы

1. **`src/server/database/repositories/interface/service.ts` (updateCidr)** — убран O(n²) баг: внутри цикла `for (const client of clients)` был лишний запрос `tx.query.client.findMany().execute()`, который перезаписывал переменную `clients` и выполнялся на каждой итерации (N+1). Теперь один запрос до цикла. Это было помечено как `// TODO: optimize`.
2. **`src/app/components/ClientCard/OneTimeLink.vue`** — в `onUnmounted` было `clearTimeout(timer.value)`, хотя таймер создаётся через `setIntervalImmediately` (setInterval). Исправлено на `clearInterval`. Без фикса таймер продолжал работать после размонтирования.
3. **`src/app/pages/setup/migrate.vue`** — удалён отладочный `console.log('selected file', ...)`.

### 2026-09-26: фиксы багов + безопасность + мёртвый код

4. **8 endpoint'ов клиента** (`src/server/api/client/[clientId]/`: `index.get`, `index.post`, `index.delete`, `enable.post`, `disable.post`, `generateOneTimeLink.post`, `qrcode.svg.get`, `configuration.get`) — `checkPermissions(client)` вызывался ДО null-check → TypeError/500 вместо 404 на несуществующем клиенте. Порядок исправлен: сначала 404, потом проверка прав.
5. **`src/server/utils/Database.ts`** — переписан Proxy: теперь каждый вызов ждёт `startupPromise`, а не падает с «Database not yet initialized» (ранний запрос на `/api/session` сразу после старта → 500). `WireGuard.Startup()` обёрнут в try/catch: если интерфейс не поднялся (нет модуля ядра/устройства), API всё равно жив, ошибка — в логах. Вероятная причина «ошибки n18i после авторизации».
6. **`src/server/utils/release.ts` + `src/server/api/information.get.ts`** — репо в GitHub API `evoll/awg-easy` → `fast-iq/awg-easy`; semver: стрип префикса `v` + проверка `valid()` (не-semver тег больше не роняет 500); при недоступности GitHub `/api/information` возвращает `latestRelease: null` вместо падения страницы.
7. **`src/server/utils/WireGuard.ts`** — вынесен хелпер `applyDumpToClients()`: Map по publicKey, O(n+m) вместо O(n²) (`clients.find()` внутри `forEach` по dump). Горячий путь: главная страница поллит `/api/client` раз в секунду.
8. **Ссылки evoll → fast-iq**: `src/server/plugins/manager.ts`, `src/app/components/Ui/Footer.vue` (2 ссылки), `src/app/components/Header/Update.vue` (+ префикс `v` в теге релиза).
9. **`src/server/database/repositories/oneTimeLink/service.ts`** — OTP-ссылки: `Math.random()`+CRC32 → `crypto.randomBytes(16).toString('hex')` (128 бит энтропии). Удалён зависимость `crc-32` из package.json (была использована только здесь).
10. **Мёртвый код удалён**: `validateAwgParams` в `src/server/utils/awg-params.ts` (валидация дублируется в zod-схеме `interface/types.ts`); `UI_CHART_TYPES` в `src/app/utils/chart.ts`; неиспользуемые иконки: ArrowRightCircle (внутри был баг — импортировал ArrowLeftCircleIcon), Stack, Warning, CheckCircle, Delete, ArrowInf, ArrowLeftCircle.

### Найденные проблемы (НЕ исправлены, требуют решения)

**Безопасность:**
- ~~`oneTimeLink/service.ts:49` — OTP-ссылки через `Math.random()`+CRC32~~ — **исправлено 2026-09-26**: `crypto.randomBytes(16)`.
- `session.ts` — нет rate limiting на `/api/session` (POST), есть TODO про timing attack при Basic auth.
- `session.ts:15` — сессии без истечения срока (TODO: add session expiration); cookie maxAge только при rememberMe.

**Баги:**
- `client/service.ts:208,273` — `userId: 1` захардкожен (TODO: properly assign user id). Клиенты создаются не от имени текущего пользователя.
- ~~`client/[clientId]/index.get.ts:13` — `checkPermissions(result)` вызывается ДО проверки `if (!result)`~~ — **исправлено 2026-09-26** во всех 8 endpoint'ах `[clientId]`.
- `WireGuard.ts:19` — БД на `file:/etc/wireguard/wg-easy.db`, а миграции ищутся через `process.cwd()` — хрупко при смене cwd.
- `Dockerfile:72-75` — в финальный образ ставится `libsql` через npm (native), отдельно от pnpm — потенциальный источник проблем с бинарниками.

**Оптимизации:**
- ~~`WireGuard.ts` — `clients.find()` внутри `forEach` по dump = O(n²)`~~ — **исправлено 2026-09-26**: хелпер `applyDumpToClients()` с Map по publicKey.
- `app/pages/index.vue:47` — поллинг `/api/client` раз в 1000 мс; есть TODO про websocket.
- `stores/clients.ts` — сортировка на клиенте (TODO: move sort to backend); история графиков хранится в памяти браузера и теряется при перезагрузке.
- i18n: все 15 локалей (~140 КБ) грузятся целиком; только en в бандле по умолчанию (`i18n.config.ts`), остальные — через lazy? Проверить, что другие локали не попадают в initial bundle.
- ~~`release.ts` — semver без обработки префикса `v`, не-semver тег → 500~~ — **исправлено 2026-09-26**: стрип `v` + `valid()`.

**Дубли/мёртвый код:**
- ~~`awg-params.ts` — `validateAwgParams` не используется~~ — **удалено 2026-09-26**.
- ~~Неиспользуемые иконки: ArrowRightCircle, Stack, Warning, CheckCircle, Delete, ArrowInf, ArrowLeftCircle~~ — **удалены 2026-09-26**.
- ~~`UI_CHART_TYPES` в `app/utils/chart.ts` не используется~~ — **удалено 2026-09-26**.

**Ссылки на старый репозиторий evoll/awg-easy (репо уже fast-iq):**
- ~~`src/server/utils/release.ts:9` — API GitHub для `evoll/awg-easy`~~ — **исправлено 2026-09-26**.
- ~~`src/server/plugins/manager.ts`, `app/components/Ui/Footer.vue`, `app/components/Header/Update.vue`~~ — **исправлено 2026-09-26**.
- README, docs, ISSUE_TEMPLATE — ссылки ещё на evoll (не тронуто, косметика).

## Обновление зависимостей (проверено 2026-09-26 через npm registry dist-tags)

### Можно обновлять БЕЗОПАСНО (patch/minor в рамках текужого major):
| Пакет | Сейчас | Можно до |
|---|---|---|
| vue | `latest` (!) | зафиксировать на `^3.5.x` (latest = 3.5.43) |
| nuxt | ^3.19.3 | ^3.21.11 (тег 3x) — major 4 не брать |
| drizzle-orm | ^0.44.7 | 0.45.3 (minor, проверить breaking в changelog) |
| zod | ^4.1.12 | ^4.6.5 |
| @nuxtjs/i18n | ^10.2.0 | ^10.6.0 |
| pinia | ^3.0.3 | ^3.x (4.0 не брать — major) |
| @pinia/nuxt | ^0.11.2 | ^0.11.x (1.0 не брать без проверки) |
| radix-vue | ^1.9.17 | актуально |
| @vueuse/core, @vueuse/nuxt | ^14.0.0 | 15.0.0 — major, проверить |
| @libsql/client | ^0.15.15 | 0.18.0 — minor в 0.x = потенциально breaking, проверить |
| otpauth | ^9.4.1 | ^9.5.2 |
| argon2 | ^0.44.0 | 0.45.1 — проверить (native) |
| apexcharts | ^5.3.5 | 7.x — major, не брать |
| vue3-apexcharts | ^1.10.0 | ^1.11.1 |
| drizzle-kit | ^0.31.6 | ^0.31.11 |
| esbuild | ^0.25.11 | 0.28.x — проверить (cli:build) |
| eslint | ^9.38.0 | 9.x (10 не брать) |
| typescript | ^5.9.3 | 5.x (7 не брать!) |
| vue-tsc | ^3.1.3 | ^3.3.11 |
| @nuxt/eslint | ^1.10.0 | ^1.17.0 |
| citty | ^0.1.6 | 0.2.2 — проверить (cli) |
| semver | ^7.7.3 | ^7.8.5 |
| js-sha256 | ^0.11.1 | 1.x — major, проверить |
| qr | ^0.5.2 | 0.7.0 — проверить API encodeQR |
| cidr-tools | ^11.0.3 | 13.x — major, не брать без проверки |
| ip-bigint | ^8.2.2 | 10.x — major, не брать |
| is-cidr | ^6.0.1 | 7.x — major, проверить |
| prettier (src) | ^3.7.4 | ^3.9.9 |
| prettier-plugin-tailwindcss | ^0.7.1 | 0.8.1 — проверить (может переформатить) |
| tsx | ^4.20.6 | ^4.23.15 |
| @types/semver | ^7.7.1 | ^7.8.0 |

### НЕ обновлять:
- nuxt → 4.x (major, breaking)
- pinia → 4.x (major)
- apexcharts → 7.x (major + vue3-apexcharts может не поддерживать)
- typescript → 7.x (native tsc, breaking)
- eslint → 10.x (major)
- cidr-tools / ip-bigint → major (используются в ядре логики IP)

### Порядок обновления:
1. Зафиксировать `vue` на `^3.5.43`.
2. Обновлять по одному пакету (или группами связанных), после каждого — `pnpm check:all` в Docker/CI.
3. Для drizzle-orm 0.45 проверить, что миграции (`drizzle-kit generate`) не генерируют новый мигрейшн.
4. После всех обновлений — полный `pnpm check:all` + docker build + ручной прогон setup (docker-compose.dev.yml).

## Неудачные изменения / ошибки

- 2026-09-26: «ошибка n18i после авторизации» — точного совпадения с этим текстом в коде нет. Наиболее вероятная причина — ранний 500 на `/api/session` или `/api/client` сразу после логина, когда БД/интерфейс ещё не готовы (Proxy в `Database.ts` бросал «Database not yet initialized»). Исправлено ожиданием `startupPromise` + try/catch вокруг `WireGuard.Startup()`. Проверить на проде после деплоя; если ошибка вернётся — смотреть точный текст в консоли браузера и логах контейнера.
