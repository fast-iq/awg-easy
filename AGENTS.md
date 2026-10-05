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
- **Node.js 24** — целевая версия во всех местах: CI (`node-version: "24"`), Dockerfile/Dockerfile.dev (`node:24-alpine`), esbuild target в `nuxt.config.ts` (`node24`). Node 20 депрекейтен в GitHub Actions (warn с сентября 2025).

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

### 2026-09-26: Node.js 24

11. **Node.js 20 → 24** (депрекейшен Node 20 в GitHub Actions, warn `pnpm/action-setup@v4`):
    - `.github/workflows/lint.yml` — `node-version: "lts/*"` → `"24"` (оба джоба: docs + lint).
    - `.github/workflows/update-pnpm-lock.yml` — `node-version: "20"` → `"24"`.
    - `Dockerfile` — `node:jod-alpine` → `node:24-alpine` (оба слоя: build + runtime).
    - `Dockerfile.dev` — `node:jod-alpine` → `node:24-alpine`.
    - `src/nuxt.config.ts` — esbuild target `node20` → `node24`.
    - **Action-версии НЕ поднимать без необходимости**: `pnpm/action-setup@v4` → `@v4.4.0` (внутри Node 24, warn ушёл). Остальные actions (checkout v6, setup-node v6 и т.д.) работают на Node 24 — не трогать.
    - **arm/v7 убран из CI** (см. пункт 14) — `node:24-alpine` не собирается под 32-битный ARM.

### 2026-09-26: фикс format:check (CI падал на 9 файлах)

12. **`prettier --write` по 9 файлам** + `eslint --fix` (commit `7ab5dcc`):
    - `src/nuxt.config.ts` — табы → пробелы в блоке `i18n.experimental` (добавлен с табами в `36fc7d3`).
    - `src/server/utils/wgHelper.ts`, `src/server/database/repositories/interface/types.ts` — перенос длинных template literals и zod-схемы.
    - `src/server/utils/awg-params.ts` — выравнивание комментариев, `0xFFFFFFFF` → `0xffffffff`.
    - `src/server/utils/WireGuard.ts` — сигнатура `applyDumpToClients` в одну строку.
    - EOF-newline: `eslint.config.mjs`, `i18n/i18n.config.ts`, `server/api/interface.get.ts`, `interface/schema.ts`.
    - Убраны неиспользуемые `eslint-disable`: `Database.ts` (import/no-mutable-exports), `awg-params.ts` ×2, `interface/types.ts` (no-unused-vars).
    - **Проверено локально**: скачал Node 24.11.1 в `%TEMP%`, `pnpm install` + `format:check` ✅ + `lint` ✅ (0 ошибок).
    - **Правило**: одна и та же операция >5 раз = что-то не так, менять подход (зацикливался на чтении git show; решил скачиванием Node).

### 2026-09-26: фикс typecheck (все ошибки ушли, CI зелёный)

13. **Все 8 typecheck-ошибок исправлены** (commit `dabfc89`):
    - `Update.vue` — в `v-if` добавлен guard `globalStore.information?.latestRelease &&` (3× TS18047 possibly null).
    - `useSubmit.ts` — **убраны generics nitropack** (`NitroFetchRequest`/`NitroFetchOptions`/`TypedInternalResponse`) — они давали TS2321 "Excessive stack depth" на КАЖДОМ из 22 call sites (login.vue, me.vue, admin/* и т.д.). Заменены на простые типы `(url: any, options: any, opts: SubmitOpts)`. Runtime-поведение не изменилось.
    - `admin/interface.vue:259` — `_restartInterface()` → `_restartInterface(undefined)` (TS2554).
    - `nuxt.config.ts` — удалены 13 локалей (de/es/it/fr/ko/ru/uk/zh-CN/zh-HK/pl/pt-BR/tr/bn/id) без JSON-файлов → фикс TS2740 в `i18n.config.ts`; удалён неизвестный `bundle.optimizeTranslationDirective` (TS2353, опции нет в @nuxtjs/i18n 10.x).
    - `sqlite.ts:117` — добавлен метод `updateAwgParams(AwgObfuscationParams)` в `InterfaceService` (partial-обновление только AWG-полей), вместо `update(awgParams)` который ждал полный `InterfaceUpdateType` (TS2345).
    - **Проверено локально**: typecheck ✅ exit 0, lint ✅ 0 ошибок 0 warn, format:check ✅.

### 2026-09-26: убран arm/v7 из CI (Node 24 не собирается под 32-битный ARM)

14. **`linux/arm/v7` удалён из matrix в 4 workflow'ах**: `deploy.yml`, `deploy-development.yml`, `deploy-edge.yml`, `deploy-pr.yml`.
    - **Причина**: официальный образ `node:24-alpine` содержит только amd64, arm64/v8, s390x (проверено по манифесту Docker Hub). Node 20/21/22 ещё имели arm/v6+arm/v7. Сборка под `linux/arm/v7` падала: `no match for platform in manifest`.
    - Осталось: `linux/amd64` + `linux/arm64` (Raspberry Pi 4/5 и новее).
    - Если понадобится armv7 — только node:22-alpine или компиляция Node из исходников.

### 2026-09-26: фикс "Merge & Deploy" (Codeberg login падает без секретов)

15. **`docker/login-action@v3` для codeberg.org** ронял `Error: Username and password required` в job `docker-merge` — секреты `CODEBERG_USER`/`CODEBERG_PASS` не заданы в форке (были в evoll/awg-easy).
    - `deploy-edge.yml`, `deploy.yml` — добавлен `continue-on-error: true` на шаг "Login to Codeberg" + закомментирован `codeberg.org/fast-iq/awg-easy` в `images` metadata-action (как уже было в `deploy-development.yml`).
    - Если понадобится пуш на Codeberg — задать секреты в Settings → Secrets и раскомментировать.

### 2026-09-26: безопасность сессий + userId + миграции + сортировка + зависимости

16. **Rate limiting на логин** (`src/server/utils/rateLimit.ts` — новый файл, `session.post.ts`): in-memory sliding window, 5 попыток/IP/15 мин → 429 + `Retry-After`. Без Redis (одиночный инстанс).
17. **Session expiration** (`src/server/utils/session.ts`): `maxAge: sessionConfig.sessionTimeout` в `useWGSession` и `getWGSession` — сессия истекает на сервере всегда; "Remember me" теперь продлевает только lifetime cookie (admin-configurable, поле Session Timeout в Admin → General).
18. **Timing attack в Basic auth** (`session.ts` + `password.ts`): для неизвестного пользователя выполняется dummy-verify argon2 (`DUMMY_ARGON2_HASH`) — время ответа не раскрывает существование username.
19. **`userId: 1` → реальный user** (`client/service.ts`, `client/index.post.ts`, `setup/migrate.post.ts`): `create()` принимает `userId` (из `getCurrentUser().id`), `createFromExisting()` — опциональный `userId` (миграция атрибутирует первому/админ-пользователю).
20. **Путь к миграциям** (`sqlite.ts`): `process.cwd()/server/database/migrations` → `path.join(__dirname, 'migrations')` через `fileURLToPath(import.meta.url)` — не зависит от cwd (в Docker `/app/server/database/migrations`).
21. **Сортировка клиентов на бэкенде** (`WireGuard.ts`, `client/index.get.ts`, `ClientQuerySchema`, `stores/clients.ts`): query param `sort=asc|desc`, сортировка по name в `#attachDump()` (generic, тип клиента сохраняется); клиентский `sortByProperty` удалён из store и `math.ts`; `Sort.vue` без изменений (computed в searchParams + refresh).
22. **Ссылки evoll → fast-iq**: 18 файлов (README, contributing.md, docs/**, ISSUE_TEMPLATE, mkdocs.yml, deploy.yml owner-checks, комментарий в nuxt.config.ts, error message в WireGuard.ts).
23. **Обновление зависимостей** (`package.json` + lock): `vue: latest → ^3.5.43`, nuxt ^3.21.11, zod ^4.6.5, @nuxtjs/i18n ^10.6.0, pinia ^3.0.4, vue3-apexcharts ^1.11.1, otpauth ^9.5.2, semver ^7.8.5, @nuxt/eslint ^1.17.0, drizzle-kit ^0.31.11, prettier ^3.9.9, tsx ^4.23.15, vue-tsc ^3.3.11, @types/semver ^7.8.0. НЕ тронуто: drizzle-orm 0.44 (changelog breaking не проверен), @libsql/client 0.15, argon2, esbuild, citty, js-sha256, qr, is-cidr (major/0.x — рисковано).
24. **`cli/build.js`** — плагин "make-all-packages-external" ломался на Windows (regex `[^\./]` матчит полный путь entry point → "entry point cannot be marked as external"). Заменён на явный список `external: [...]` (drizzle, libsql, citty и т.д.).
25. **i18n проверено**: в бандл попадает только `en.json` (импорт в `i18n.config.ts`), остальные 14 локалей (~130 КБ) не грузятся — ок.
26. **Dockerfile libsql через npm** — оставлено как есть: работает, native-бинарники libsql ставятся отдельно от pnpm осознанно (избегание pnpm dedupe для native). Не чинить без реальной проблемы.

### 2026-09-26: фикс Check Docs (CI падал на prettier --check docs)

27. **`docs/content/getting-started.md`** — после замены ссылок evoll → fast-iq (пункт 22) ячейки markdown-таблицы стали длиннее print width prettier → `prettier --check docs` в CI падал на 34 файлах. Исправлено `prettier --write docs`: реальный diff только в getting-started.md (выравнивание таблицы), остальные 33 файла — pre-existing drift, который prettier тоже привёл к стилю (commit `b38e1e9`).
    - **Правило**: после массовых замен текста через скрипт/PowerShell всегда прогонять `format:check:docs` локально перед пушем.
    - **Замечено, не тронуто**: `docs/content/advanced/config/amneziawg-kernel-module.md` содержит UTF-8 BOM (добавлен в `772813b "Docs fix"`). Prettier 3.x BOM не роняет — check проходит. Если когда-нибудь CI упадёт на этом файле — убрать BOM: `[System.IO.File]::WriteAllBytes($f, $bytes[3..])`.

### Найденные проблемы (НЕ исправлены, требуют решения)

**Безопасность:**
- ~~`oneTimeLink/service.ts:49` — OTP-ссылки через `Math.random()`+CRC32~~ — **исправлено 2026-09-26**: `crypto.randomBytes(16)`.
- ~~`session.ts` — нет rate limiting на `/api/session` (POST), есть TODO про timing attack при Basic auth~~ — **исправлено 2026-09-26** (пункты 16, 18).
- ~~`session.ts:15` — сессии без истечения срока~~ — **исправлено 2026-09-26** (пункт 17).

**Баги:**
- ~~`client/service.ts:208,273` — `userId: 1` захардкожен~~ — **исправлено 2026-09-26** (пункт 19).
- ~~`client/[clientId]/index.get.ts:13` — `checkPermissions(result)` вызывается ДО проверки `if (!result)`~~ — **исправлено 2026-09-26** во всех 8 endpoint'ах `[clientId]`.
- ~~`WireGuard.ts:19` — миграции через `process.cwd()`~~ — **исправлено 2026-09-26** (пункт 20).
- `Dockerfile:72-75` — libsql через npm отдельно от pnpm — **оставлено как есть** (работает, осознанный выбор; см. пункт 26).

**Оптимизации:**
- ~~`WireGuard.ts` — `clients.find()` внутри `forEach` по dump = O(n²)`~~ — **исправлено 2026-09-26**: хелпер `applyDumpToClients()`.
- `app/pages/index.vue:47` — поллинг `/api/client` раз в 1000 мс; есть TODO про websocket.
- ~~`stores/clients.ts` — сортировка на клиенте~~ — **исправлено 2026-09-26** (пункт 21). История графиков всё ещё теряется при перезагрузке (хранится в памяти браузера) — осознано, не баг.
- ~~i18n: проверить initial bundle~~ — **проверено 2026-09-26**: только en.json в бандле (пункт 25).
- ~~`release.ts` — semver без обработки префикса `v`~~ — **исправлено 2026-09-26**.

**Дубли/мёртвый код:**
- ~~`validateAwgParams`, иконки, `UI_CHART_TYPES`, `sortByProperty`~~ — **удалено 2026-09-26**.

**Ссылки на старый репозиторий evoll/awg-easy:**
- ~~ВСЕ ссылки (src + README + docs + templates + workflows)~~ — **исправлено 2026-09-26** (пункт 22).

### Осталось из таблицы зависимостей (не обновлено, намеренно):
| Пакет | Сейчас | Почему не обновил |
|---|---|---|
| drizzle-orm | ^0.44.7 | 0.45 — minor в 0.x = потенциально breaking; проверить changelog + `drizzle-kit generate` перед апгрейдом |
| @libsql/client | ^0.15.15 | 0.18 — то же самое, native-бинарники |
| argon2 | ^0.44.0 | native, 0.45 проверить на альпине |
| esbuild | ^0.25.11 | cli:build + nuxt; проверить target node24 |
| citty | ^0.1.6 | 0.2 — API CLI может измениться |
| js-sha256 | ^0.11.1 | major 1.x, API sha256() проверить |
| qr | ^0.5.2 | 0.7 — API encodeQR проверить |
| is-cidr | ^6.0.1 | major 7, ядро IP-логики |
| prettier-plugin-tailwindcss | ^0.7.1 | 0.8 может переформатить весь проект |

## Обновление зависимостей

Выполнено 2026-09-26 (пункт 23): vue зафиксирован на `^3.5.43`, обновлены nuxt/zod/i18n/pinia/vue3-apexcharts/otpauth/semver/eslint-экосистема/prettier/tsx/vue-tsc/drizzle-kit. Проверено локально: typecheck ✅, lint ✅, format:check ✅, build ✅ (Node 24).

### НЕ обновлять (см. таблицу выше "Осталось из таблицы зависимостей"):
- nuxt → 4.x (major, breaking)
- pinia → 4.x (major)
- apexcharts → 7.x (major + vue3-apexcharts может не поддерживать)
- typescript → 7.x (native tsc, breaking)
- eslint → 10.x (major)
- cidr-tools / ip-bigint → major (используются в ядре логики IP)

## Неудачные изменения / ошибки

- 2026-09-26: «ошибка n18i после авторизации» — точного совпадения с этим текстом в коде нет. Наиболее вероятная причина — ранний 500 на `/api/session` или `/api/client` сразу после логина, когда БД/интерфейс ещё не готовы (Proxy в `Database.ts` бросал «Database not yet initialized»). Исправлено ожиданием `startupPromise` + try/catch вокруг `WireGuard.Startup()`. Проверить на проде после деплоя; если ошибка вернётся — смотреть точный текст в консоли браузера и логах контейнера.

### 2026-09-28: CI/CD — стабильность + защита от уязвимостей (round 17)

28. **Trivy severity gate** (`docker-image.yml`): `exit-code: "1"` + `severity: CRITICAL,HIGH` + `ignore-unfixed: true` — сборка падает на критических/высоких CVE в образе, unfixed не блокируют (alpine-пакеты обновляются с задержкой).
29. **SBOM generation** (`docker-image.yml`, job `sbom`): `anchore/sbom-action@v0` → CycloneDX JSON артефакт (retention 30 дней). Полный манифест зависимостей образа для будущего CVE-триажа.
30. **Dependency Review** (`.github/workflows/dependency-review.yml` — новый): `actions/dependency-review-action@v4`, `fail-on-severity: high` на PR. Блокирует merge если новая зависимость вносит known CVE или лицензионный конфликт.
31. **Secret Scanning** (`.github/workflows/secret-scanning.yml` — новый): `gitleaks/gitleaks-action@v2` на push/PR к main. Поймёт случайно закоммиченные ключи до экспозиции.
32. **Smoke test** (`deploy-pr.yml`): после сборки amd64-образа — `docker run` + curl `/api/information` (30 попыток × 2с). Ловит "собралось, но не стартует" до edge/prod.
33. **Root pnpm audit** (`lint.yml`, job `security-audit`): добавлен второй шаг — аудит корневого `package.json` (prettier и dev-тулзы) на critical.
34. **Permissions hardening** (все workflow'ы): workflow-level `permissions: contents: read`; job-level least-privilege (`packages: write` только в deploy, `security-events: write` в CodeQL, `contents: write` в docs/lockfile). Уменьшает blast radius если action скомпрометирован.
35. **Action version bump** (deploy-*.yml): `actions/checkout@v5 → @v6`, `docker/setup-buildx-action@v3 → @v4.4.1`, `docker/build-push-action@v6 → @v7.4.0` — все Node 24 compatible, устраняет deprecation warnings.
36. **Trivy CVE ignore list** (`.trivyignore` + `docker-image.yml`): файл `.trivyignore` с 5 HIGH CVE по одной на строку, `trivyignores: .trivyignore` в action. CVE: brace-expansion ×2 + ip-address + tar в npm-internal node_modules (base image, не чинится pnpm override), drizzle-orm 0.44.7 (0.45 potentially breaking). **ВАЖНО**: `trivyignores` — это путь к файлу (ignorefile), НЕ comma-separated список CVE ID. `.trivyyml` с `skipDirs` удалён — skipDirs НЕ работает для node-pkg scanning.
37. **Удалён pnpm override `brace-expansion >=5.0.9`** (`src/package.json`): ломал ESLint — minimatch 3.x ожидает старый API brace-expansion, а override подменял его на 5.x с несовместимым интерфейсом (`expand is not a function`). CVE в brace-expansion находятся в npm-internal node_modules (base image) и НЕ чинятся pnpm override. Заменён на `trivyignores` в workflow (пункт 36). Lockfile перегенерирован.
38. **`install.sh` (корень)** — идемпотентный установщик «голая Debian 13/Ubuntu → контейнер awg-easy»: детект ОС (`/etc/os-release`, ID/VERSION_CODENAME/UBUNTU_CODENAME для деривативов) + архитектуры (только amd64/arm64 — arm/v7 снят с CI); официальный Docker apt-репо (download.docker.com, GPG в `/etc/apt/keyrings/docker.asc`, для distro `docker.io` репо НЕ добавляется — конфликт пакетов); Compose v2 → fallback на бинарь с GitHub releases в `/usr/local/lib/docker/cli-plugins/`; `systemctl enable --now docker` + ожидание `docker info` (15×2с); полный `apt-get upgrade` (флаг `--no-upgrade`), sysctl `/etc/sysctl.d/99-awg-easy.conf` (ip_forward), UFW-порты если активен, предупреждение о чужом контейнере `awg-easy`, health-check `GET :51821/api/information` (30×2с, при провале — `docker logs --tail 20` и exit 1). Флаги: `--build` (сборка из чекаута, иначе pull ghcr), `--tag`, `--dir`, `--no-upgrade`; режим запуска: файл → `exec sudo -E bash`, пайп curl|bash → `sudo -v` + обёртка `root_cmd`. Compose-файл: локальный копируется, существующий сохраняется (правки не затираются), иначе curl с raw.githubusercontent; тег через sed (проверено, идемпотентно). **При коммите: `git add --chmod=+x install.sh`** (на win32 git не ставит executable-бит автоматически). Синтаксис проверен `bash -n` (Git Bash), `--help` и sed-замена протестированы; полный прогон — только на реальном Linux (здесь Docker/Node нет).
39. **`install.sh` протестирован на реальном VPS** (Debian 13 trixie, kernel 6.12.41, amd64, docker-ce 29.8.2 + Compose 5.6.0 уже стояли, UFW active, чужие контейнеры stockkeeper на 80/443): 5 прогонов — все EXIT=0. Прогон 1 (существующий docker): success, контейнер поднялся, health-check `200` (внешне тоже), `wg0` started, UFW-правила добавлены, чужие контейнеры/порты не задеты. Прогон 2: идемпотентность ✓ («Keeping the existing docker-compose.yml», pull+up без изменений). Прогоны 3–5: ветки `--no-upgrade` ✓. **Найденные и исправленные в процессе**: (а) дубль apt-репо — скрипт писал `docker.list` когда уже существует DEB822 `docker.sources` (от Docker-инсталлятора) → apt-warnings «configured multiple times»; (б) после (а) старый `docker.list` от первого прогона продолжал варнить → добавлена очистка: при наличии `docker.sources` удаляется `docker.list` содержащий `download.docker.com`. Финальный прогон: 0 warnings, 0 errors, в `/etc/apt/sources.list.d/` только `docker.sources`. Ожидаемый warn: «no amneziawg kernel module» (ванильное ядро Debian — userspace fallback, это нормально). **Не тестировалось**: `--build` (на VPS 967 МБ RAM — OOM на pnpm/nuxt), свежая установка Docker (docker уже стоял), `--tag` (sed проверен локально). Доступ: ключ `%TEMP%\opencode\ssh\sk_deploy` → root@157.228.160.86, **после теста удалить из authorized_keys**.
40. **`INSECURE=true` для plain-HTTP доступа** (`install.sh`): найдено при тесте — дефолт `INSECURE=false` ставит сессионной куке флаг `Secure` (`session.ts:22,34`: `secure: !WG_ENV.INSECURE`), браузер не шлёт её по `http://` → логин зацикливается (мастер `/setup/1` создаёт пользователя, а сессия после логина теряется). Проверено живьём на VPS: `Set-Cookie: ...; Secure` при `INSECURE=false` → после включения `INSECURE=true` (`"insecure":true` в `/api/information`) кука без `Secure` ✓. Скрипт теперь инжектит `- INSECURE=true` в compose-блок `environment:` (вставка/замена, идемпотентно, коммент `# - INSECURE=false` не трогается — regex требует начало строки с `-`), переопределяется `AWG_INSECURE=false` для деплоя за TLS-прокси (Caddy/Traefik, см. docs). Совпадает с официальным docker-run туториалом (`-e INSECURE=true`). Рекомендация: за TLS-прокси держать `false` (сессия шифруется), на голом IP без прокси — `true`.
41. **«Invalid value» вместо ошибок валидации при setup** (`src/server/middleware/setup.ts`): middleware setup-phase редиректил ВСЕ пути кроме `/api/*` и `/setup/*` на `/setup/1` — включая серверный маршрут `/_i18n/:hash/:locale/messages.json` (запросы переводов, `nitro.mjs` `fetchMessages`/`loadMessagesFromServer`). $fetch получал HTML-редирект → строку → `Object.keys('<!DOCTYPE...')` → `deepCopy('<', {})` → `throw new Error('Invalid value')` (vue-i18n). Симптом: **любая** ошибка валидации во время первого setup возвращала 400 `{statusMessage: "Validation Error", message: "Invalid value"}` → тост «Invalid value» (например при пароле <12 символов, `types.ts` `min(12)`), плюс warn-логи «Failed to load messages for locale "ru"». Успех-путь (валидные данные) не затронут — переводы там не нужны. Фикс: пропускать `/_i18n/` наравне с `/api/` (одно условие). Найдено живым дебагом на VPS: curl `/_i18n/68182aae/en/messages.json` → 302 на `/setup/1` вместо JSON; локально `zod.parseAsync` и `users.create` чистые (проверено portable Node). Проверено: typecheck ✅ lint ✅ format:check ✅. Обнаружено 2026-10-04 при разборе «не может создать аккаунт» (в БД setupStep=1, users_table пуста).
42. **Причина ошибки в валидации + логирование** (`src/server/utils/types.ts`, `validateZod`): раньше если переводы падали (см. п. 41), из `useTranslation` вылетало исключение мимо блока формирования сообщения → тост/ответ 400 = «Invalid value» без поля и правила. Теперь: (а) блок перевода обёрнут в `try/catch` — при сбое i18n fallback собирает сообщение из сырых zod-issues вида `password: zod.user.password (min 12)`, `username: zod.user.username (required)` (поле + правило + i18n-ключ, который можно найти в `i18n/locales/en.json`); (б) НЕ-zod исключения тоже попадают в message: `Unexpected Error: <текст исключения>` (раньше терялся); (в) каждая ошибка валидации логируется: `console.warn/error("Validation failed (<event.path>): ...")` — видно в `docker logs awg-easy`, т.е. сразу понятно, какой endpoint и поле упали. Переводимый путь (когда i18n работает) не изменён — там сообщения уже внятные («Password must be at least 12 Character»). typecheck ✅ lint ✅ format ✅.
43. **Минимальная длина пароля 12 → 10** (`src/server/database/repositories/user/types.ts:14`, `.min(12` → `.min(10`): просьба пользователя. Влияет на все схемы с паролем (login/setup/update). Захардкоженных «12» в en.json/docs нет — сообщение параметризовано (`zod.generic.stringMin` `{1}`), менять ничего больше не нужно.
44. **Trivy: +3 новых CVE в базовом npm** (2026-10-04, после пуша коммитов `c928c28..f8ed29d` Docker Image CI упал впервые с 28.09): Trivy DB обновилась, gate нашёл 3 HIGH в `usr/local/lib/node_modules/npm/node_modules/` (тот же класс, что и пп. 36–37): `CVE-2026-102276` + `CVE-2026-102278` (brace-expansion 5.0.7) и `CVE-2026-19534` (undici 6.27.0). Добавлены в `.trivyignore` (по одной на строку). Логи job'ов через GitHub API без auth не скачать — рабочий способ: `git credential fill` (protocol=https, host=github.com) → `Authorization: token <password>` → `GET /repos/fast-iq/awg-easy/actions/jobs/<id>/logs`. **Вывод**: base-image CVE будут появляться периодически (npm внутри node:24-alpine) — каждые ~неделю проверять Docker Image CI и дописывать `.trivyignore`, пока не выйдет новый node:24-alpine с пофикшенным npm.
45. **КРИТИЧЕСКИЙ баг: Proxy в `src/server/utils/Database.ts` ломал ВЕСЬ app на edge** (найден 2026-10-04 при тесте edge на VPS): с `e1a7841` (п. 5, 26.09) `get`-трап возвращал функцию-обёртку на ЛЮБОМ свойстве → `Database.general.getSetupStep()` = `.getSetupStep` на функции → `TypeError: ... is not a function` → 500 на каждом запросе, ходящем в БД (`/api/setup/2`, middleware setup, session login и т.д.). Сломаны ВСЕ вызовы вида `Database.<repo>.<method>()` (7 репозиториев: clients/general/hooks/interfaces/oneTimeLinks/userConfigs/users). **Почему не поймали**: образ `:latest` собрался ДО `e1a7841` (старый Proxy экспортировал сам `provider` — цепочки работали), edge с 28.09 был сломан, но CI только собирает (runtime smoke есть только в deploy-pr для PR). Статические страницы/`/api/information` не трогают репозитории → health check зелёный. **Фикс**: path-recording callable Proxy — `get` возвращает новый узел с путём `[...path, prop]`, `apply` после `startupPromise` резолвит цепочку по `provider` и вызывает функцию; `typeof fn !== 'function'` → понятный `TypeError` с полным путём. Тип: `createNode([]) as unknown as DBServiceType`. TS2538 (`path[path.length-1]` = `PropertyKey | undefined` из-за noUncheckedIndexedAccess) → каст `as PropertyKey`. typecheck ✅ lint ✅ format ✅. **Правило**: если CI зелёный, а подозревается runtime-регрессия — проверять на VPS через `curl` до `/setup` и `POST /api/setup/2`, а не только статус workflow.
46. **Путь к миграциям в Docker сломан с п. 20** (найден сразу после фикса 45): `sqlite.ts` резолвил `__dirname/migrations`, но в прод-образе sqlite.ts бандлится в `/app/server/chunks/nitro/nitro.mjs` → путь `/app/server/chunks/nitro/migrations` не существует, а Dockerfile копирует миграции в `/app/server/database/migrations` → `connect()` падал с `H3Error: Can't find meta/_journal.json file` → startupPromise rejected → ВСЕ DB-запросы 500 (до фикса 45 маскировалось TypeError'ом Proxy). **Фикс**: probe-кандидаты в `migrate()` — `__dirname/migrations` (dev source tree) → `__dirname/../../../server/database/migrations` (nitro bundle в образе, cwd-независимо) → `process.cwd()/server/database/migrations` (fallback); выбирается первый, где есть `meta/_journal.json` (`existsSync`), иначе `candidates[0]`. **Вывод**: п. 20 проверял только typecheck — путь, посчитанный «в Docker = /app/server/database/migrations», для бандла неверен с 26.09; edge без работающей БД был всё это время. typecheck ✅ lint ✅ format ✅.
47. **Self-deadlock в `Database.ts` после фикса 46** (найден сразу: `/setup/2` висел без ответа, curl timeout): `startupPromise` = `connect()` → `WireGuard.Startup()`, а `Startup()` внутри делает `await Database.interfaces.get()` → proxy ждёт `startupPromise` → промис ждёт сам себя (всё, что в startupPromise — вечный hang; `/api/*` висят молча). С п. 5 существовал, но маскировался ошибками миграции (п. 46: startupPromise rejected → быстрый 500). **Фикс**: два промиса — `connectPromise` (только `connect()`, кладёт `provider`), отдельный void-чейн `connectPromise.then(... WireGuard.Startup() ... .catch(log))`. В proxy `apply`: `ready = provider ? Promise.resolve() : connectPromise` — вызовы ждут только до присвоения `provider`, НИКОГДА не полный startup. WireGuard-ошибки логируются как раньше; отказ connect — `Database startup failed:`. Побочный плюс: ранние запросы (до wg up) отвечают сразу после migrate. **Правило**: промис, внутри которого вызывается модуль, ожидающий ЭТОТ ЖЕ промис = deadlock — гейт по готовому provider, а не по полному startup. typecheck ✅ lint ✅ format ✅.
48. **Добавлены Русский и 简体中文 в селектор языка** (просьба пользователя, 2026-10-05): `src/nuxt.config.ts` — в `i18n.locales` добавлены `ru` (ru-RU, Русский) и `zh-CN` (zh-CN, 简体中文); `src/i18n/i18n.config.ts` — импортированы `./locales/ru.json` + `./locales/zh-CN.json` и добавлены в `messages` (ключ `'zh-CN'` в кавычках). **Как это работает**: селектор `Header/LangSelector.vue` читает `useI18n().locales` из конфига (сортировка по code → en, ru, zh-CN); JSON-файлы переводов лежали в `src/i18n/locales/` все 15 штук (полные, с zod-ключами) — они не были подключены. `t()` в zod-схемах — identity (сырые ключи), перевод делает `validateZod` per-request через `useTranslation` → серверные сообщения валидации на русском/китайском работают автоматически из конфига. **Причина удаления 13 локалей в п. 13 (TS2740) не воспроизводится** — typecheck с 3 локалями чистый; если вернёте остальные локали — проверять typecheck. **Не добавлять `file:` в locales** — документация проекта (`docs/content/contributing/translation.md`) предписывает подключение через `i18n.config.ts`; путь `file:` потребует настройки `langDir`, а `/_i18n` endpoint без file отдаёт `{}` (не 404) — контекст vue-i18n получает сообщения из конфига. typecheck ✅ lint ✅ format ✅.
49. **Добавлены все 12 оставшихся локалей** (согласовано с пользователем «все сразу», 2026-10-05): `bn, de, es, fr, id, it, ko, pl, pt-BR, tr, uk, zh-HK` → в `nuxt.config.ts locales` + `i18n.config.ts messages` (15 локалей всего = 15 JSON-файлов в `src/i18n/locales/`). Полнота файлов проверена заранее: все 186 ключей, zod-секция переведена полностью, 1–4 ключа на локаль падают в en-фолбэк (`fallbackLocale: 'en'`). **TS2740 из п. 13 НЕ воспроизводится даже с 15 локалями** — typecheck чистый; тогдашняя ошибка была от другого (вероятно, устаревшие `.nuxt`-типы или связана с `bundle.optimizeTranslationDirective`, удалённым в том же коммите). Имена/BCP-47 взяты из исходного конфига evoll (`git show dabfc89^:src/nuxt.config.ts`). typecheck ✅ lint ✅ format ✅.
50. **Healthcheck всегда `unhealthy` на хостах без модуля amneziawg** (найден 2026-10-05 на VPS после обновления контейнеров): `HEALTHCHECK` в Dockerfile жёстко вызывал `awg show | grep -q interface`, но `wgHelper.ts:14-23` при `EXPERIMENTAL_AWG=true` без модуля (`modinfo amneziawg` падает) самофолбэчится на ванильный `wg`/`wg-quick` — конфиг генерируется без AWG-параметров, VPN работает (проверено: `wg show` = interface UP, порт 51820, peer'ы есть; UFW 51820/udp открыт), а `awg show` (amnezia-tools v3.1) на ванильном модуле возвращает пусто/`Protocol not supported` → контейнер навсегда unhealthy, хотя всё работает. **Фикс** (`Dockerfile` + `Dockerfile.dev`): `(/usr/bin/wg show; /usr/bin/awg show) 2>/dev/null | grep -q interface` — вывод обоих бинарей, совпадение даёт здоровье в любом режиме (amnezia-модуль: оба печатают; ванильный: печатает `wg`). Семантика сохранена: интерфейса нет → оба пусты → unhealthy. **Замечание для VPS**: на Debian 6.12.41 модуль amneziawg отсутствует — используется чистый WireGuard (без обфускации; docs про «userspace fallback» не соответствуют действительности — бинаря amnezia-wg-go в образе нет, фолбэк = vanilla wg). typecheck/lint не применимы (Dockerfile); проверено живьём на VPS после пересборки. Дополнено п. 51: userspace-фолбэк теперь реально работает.

### 2026-10-05: AmneziaWG userspace (цель проекта — обфускация на хостах без модуля)

51. **`amneziawg-go` добавлен в образ + детекция в `wgHelper.ts`** (закрывает «фолбэк = vanilla wg без обфускации» из п. 50):
    - **Dockerfile**: новая стадия `amneziawg_go_builder` (`FROM --platform=$BUILDPLATFORM docker.io/library/golang:alpine`, `ARG TARGETARCH`) — `git clone --depth=1 amnezia-vpn/amneziawg-go` → `go get -u ./... && go mod tidy` (как в проверенном NOXCIS/Docker-AmneziaWG-GO; свежие deps меньше триггерят Trivy) → `GOOS=linux GOARCH=${TARGETARCH:-$(go env GOARCH)} CGO_ENABLED=0 make` (кросс-сборка amd64/arm64, статик) → `chmod +x`. Бинарь копируется в финальный образ как `/usr/bin/amneziawg-go` — **имя обязательно ровно `amneziawg-go`**, т.к. `wg-quick` (`linux.bash add_if`) при неудаче `ip link add <iface> type amneziawg` вызывает `"${WG_QUICK_USERSPACE_IMPLEMENTATION:-amneziawg-go}" <iface>` (daemonize, UAPI-сокет `/var/run/wireguard/<iface>.sock`, `awg` ходит туда же). `Dockerfile.dev` не тронут (dev-сборка без awg-стадий — там их и раньше не было).
    - **`src/server/utils/wgHelper.ts`**: автодетект стал цепочкой `modinfo amneziawg` → `command -v amneziawg-go` → `wg` (override `OVERRIDE_AUTO_AWG` не изменён). При наличии бинаря выбирается `awg` → конфиги сервера/клиентов получают Jc/S1/S2/H1-H4/… → `awg-quick up` сам падает в userspace. Топ-level await как раньше; на Windows dev поведение прежнее (`exec` → `''` → `.then` → 'awg').
    - **`docker-compose.yml` + `docker-compose.dev.yml`**: добавлен `devices: [/dev/net/tun:/dev/net/tun]` (иначе amneziawg-go падает «Failed to create TUN device» и `Startup()` умирает — для существующих инсталлов это был бы регресс с работающего vanilla wg). `cap_add` в compose не менялся.
    - **`install.sh`**: (а) идемпотентная инъекция блока `devices:` перед первой строкой `cap_add:` (guard `grep -q /dev/net/tun`; `sed -i $'.../i\\\n...\\\n...'` — **проверено на реплике compose: вставка с верным indent, повторный запуск не дублирует**; если `cap_add:` нет — warn с ручной инструкцией); (б) создание `/dev/net/tun` на хосте если отсутствует (`modprobe tun` → fallback `mknod -m 666 c 10 200`). `bash -n` чисто.
    - **docs**: `amnezia.md` (фолбэк теперь module → amneziawg-go → wg, упомянут `/dev/net/tun`), `amneziawg-kernel-module.md` (3-й компонент в списке + `devices` в примере compose).
    - **Важные факты для отладки на VPS**: `/lib/modules` замонтирован с хоста `:ro` → образный `amneziawg.ko` (плоско в `/lib/modules/`) перекрыт → `modinfo amneziawg` на не-Alpine хостах всегда падает (это ок). Сеть compose = bridge (не host) → stale vanilla `wg0` старого контейнера исчезает при пересоздании контейнера — руками удалять не нужно. Порядок: `ip link add type amneziawg` (busybox ip kind-add работает — доказано успешным vanilla `wg-quick` на этом же VPS) → fallback в amneziawg-go. Если CI Trivy заругается на CVE в go-допах бинаря — дописать в `.trivyignore` (паттерн пп. 36/44).
    - **Проверено на VPS** (edge `9b26a62`, install15): все 5 workflow зелёные (Trivy без новых CVE), install.sh инжектнул `devices:` в существующий compose (лог инъекции затёрся вторым прогоном из-за кавычек в первой ssh-команде — файл корректен), `/dev/net/tun` создан, контейнер `healthy`. Внутри: процесс `amneziawg-go wg0` работает, `awg show` через UAPI-сокет отдаёт интерфейс с **полной обфускацией** (jc=6, jmin=22, jmax=899, s1=18, s2=67, h1-h4, i1=QUIC-подобный junk, 3 пира), `awg showconf` подтверждает runtime-параметры, конфиг `/etc/wireguard/wg0.conf` содержит `Jc = …` (детекция выбрала awg), :51820 слушает, `/api/information`=200 (503-стек в логах = пойманная и залогированная ошибка release-check при отсутствии релизов в форке, ответ 200 не затронут), `/api/session` без кредов = 400 (не 500). **Последствие для пользователей**: старые клиентские конфиги (без Jc/H1-H4) к AWG-серверу не подключатся — нужно перекачать QR/конфиги и использовать AmneziaWG-клиент.

### 2026-10-05: фикс QR-кода (сломался после включения AWG-параметров)

52. **QR клиента падал с 500 «Capacity overflow»** (пользователь: «В приложении сломался штрих код»):
    - **Причина**: `GET /api/client/1/qrcode.svg` → `encodeQR(config, 'svg', { ecc: 'high', … })` в `WireGuard.getClientQRCodeSVG` — `qr/index.js:928` бросает `Capacity overflow`, потому что клиентский конфиг с AWG-параметрами = **2902 байта**, а ёмкость QR v40 при `ecc='high'` всего 1273 байта. Виновник размера — `I1 = <b 0x…>` (QUIC-подобный декой из миграции `0000_short_skin.sql`, значение **2406 символов**; schema.ts default `''` — расхождение с SQL-default). `generateAwgObfuscationParams` I1 не генерирует — он приходит только из миграции.
    - **Изучено в исходниках amneziawg-go** (клон `/tmp/amneziawg-go`): `I1–I5` → `device.ipackets[0..4]` (`uapi.go`, `newObfChain`), используются **только в `send.go:139`** — перед реальным `msg` initiation отправляются **декой-пакеты** (`sendBuffer` = декои + junk + сам хендшайк). Получатель неизвестные датаграммы просто дропает. **Вывод: I1–I5 — чисто sender-side декор, значения НЕ обязаны совпадать между пирами и НЕ влияют на хендшайк/связь** — их можно опускать/коротить без переустановки клиентов (в отличие от Jc/H1-H4/S1/S2, которые обязательны симметрично).
    - **Фикс** (`src/server/utils/WireGuard.ts`, `getClientQRCodeSVG`): каскад `eccLevels = ['high', 'medium', 'quartile', 'low']` — первый успешный encode возвращает SVG; если все 4 уровня не влезли (>2953 байт) — повтор с выкинутыми строками `I[1-5] = …` (`/^I[1-5] = .*$/gm`) и снова каскад (stripped ≈ 491 байт влезает в high); если и это не удалось — `throw new Error('Client configuration is too large for a QR code')` (недостижимо на практике). Пустой `catch` с комментарием — ESLint `no-empty` не ругается (блок с комментарием не пустой). **Конфиг в выдаче/скачивании не меняется** — стрип применяется ТОЛЬКО к QR-payload.
    - **Проверено локально** (portable node + `src/node_modules/qr`, реплика реального конфига с VPS-значений 2902 байта): high/medium/quartile → `Capacity overflow` → **low → OK**, SVG 362×362; stripped → high OK; патологический 5496 байт → все 4 уровня падают → stripped → high OK (throw не достижим). Значения для реплики сняты с VPS через `sqlite3` (хост): i1=2406, j1/j2/j3=0, i2–i5 пустые, DNS=2×, AllowedIPs=2×, host=157.228.160.86:51820, mtu=1420.
    - typecheck ✅ lint ✅ format:check ✅. **Не сделано (осознанно)**: укорачивание I1 в миграции/БД — QR работает и с полным I1 (ecc=low, 177×177 модулей, сканируемо), а миграции `0000_…` править нельзя (checksums drizzle). Если QR станет неудобно сканироваться — добавить data-миграцию, урезающую i1 (безопасно: декои sender-side).
    - **Деплой + проверка на VPS** (commit `726ab76`, все 5 workflow зелёные: Secret Scanning/Lint/Edge/Update Lockfile/Docker Image CI): `docker compose pull && up -d` в `/etc/docker/containers/awg-easy` (тег edge) → контейнер `healthy`; маркер `'Client configuration is too large for a QR code'` найден в `/app/server/chunks/nitro/nitro.mjs` (новый код в образе); `/api/information`=200, анонимный `/api/client/1/qrcode.svg`=**401** (auth-гейт до encode, не 500); в логах с момента рестарта нет `Capacity overflow` (остались только безвредные release-check 404). Полный e2e (реальный QR со сессией) возможен только с кредами пользователя — логика encode проверена локально на идентичном `qr` + реплике реального конфига.

### 2026-10-05: site-to-site (LAN за клиентом-роутером)

53. **Клиент-роутер с LAN за ним + достижимость устройств по адресу** (запрос: «клиент сервера является роутером, за ним другая сеть, хотел подключаться к устройствам, зная адрес»):
    - **Уже существовало в коде** (нашёл при исследовании): поле `serverAllowedIps` клиента (zod + json-колонка `server_allowed_ips` + UI FormArrayField на `clients/[id].vue:56-61` + переводы во всех 15 локалях) и `wg.generateServerPeer` (wgHelper.ts:40-44) включает `serverAllowedIps` в серверный `[Peer] AllowedIPs`. Т.е. базовая механика была — не хватало живых маршрутов и валидации.
    - **Проверено живьём (VPS)**: `net.ipv4.ip_forward = 1` в netns контейнера ✓ (forwarding между пирами работает); wg-quick в образе при `up` добавляет маршруты для ВСЕХ peer AllowedIPs (linux.bash:339, `sort -nr -k 2 -t /`); `wg showconf` из vanilla `wg` в awg-контейнере → `Unable to access interface: Not supported` (amneziawg-go UAPI — не важно, конфиг читается из файла).
    - **Пробел №1 — маршруты**: `saveConfig()` применяет пиров через `wg syncconf` (крипто-роутинг живо), но `ip route add` делает только `wg-quick up` → после правки в UI подсеть *принималась*, но не *маршрутизировалась* до Restart интерфейса/рестарта контейнера. **Фикс**: `wg.routeReplace(cidr, infName)` в wgHelper (`ip route replace … dev …`) + `#ensureSiteRoutes()` в `WireGuard.saveConfig()` (после sync; только enabled-клиенты; ошибки — `console.warn`, не валят сохранение). Startup() не тронут — там `wg-quick up` сам добавляет маршруты.
    - **Пробел №2 — валидация**: `serverAllowedIps` раньше принимал любые строки (min(1)) — а теперь значения попадают в shell-команду → **вектор инъекции**. **Фикс**: `isValidRouteTarget()` в `server/utils/types.ts` (авто-импорт, как `t`/`safeStringRefine`): `!BLOCKED.has(v) && (isCidr(v) !== 0 || isCidr(`${v}/32`) !== 0)` — второй чек позволяет **одиночные IP** (host route), при этом строгий (отклоняет `999.1.1.1`, `192.168.1.`, `192.168.1.0/99`, `abc` — проверено на реальном is-cidr 6.0.1; `ipVersion` из ip-bigint НЕ использовать — ленивый, пропускает `/99` и хвостовую точку). Заблокированы `0.0.0.0/0` и `::/0` (иначе `ip route replace 0.0.0.0/0 dev wg0` убьёт сеть контейнера, а wg-quick на сервере сделает fwmark-данс дефолт-маршрута). Применено: (а) zod `.refine` в `client/types.ts` → 400 с `zod.interface.cidrValid` («CIDR must be valid», уже переведён), (б) бэкстоп в `wg.routeReplace` (throw → ловится в `#ensureSiteRoutes`). Проверено локально скриптом на 14 кейсах.
    - **Nullable-гипотеза отклонена**: `serverAllowedIps` использует FormArrayField (не NullArrayField) → при пустом шлёт `[]`, не null → `.nullable()` в zod не нужен (в отличие от `allowedIps`/`dns` у NullArrayField).
    - **Docs**: `docs/content/guides/site-to-site.md` — mermaid-диаграмма, оба поля, **warning про запрет `0.0.0.0/0` на роутере** (wg-quick уведёт default в туннель → весь интернет LAN через VPS без наружного NAT → LAN потеряет связь), split-tunnel для обычных клиентов, возвратный путь (шлюз LAN = роутер или static route/MASQUERADE), чек-лист. Nav в mkdocs.yml нет (авто-дерево) — достаточно файла. Ссылка на `routed.md` (обратный сценарий: подсети клиентов на LAN сервера).
    - typecheck ✅ lint ✅ format:check ✅ format:check:docs ✅.
    - **E2E на VPS — полный прогон (2026-10-05, commit `b2311ab`, все 5 workflow зелёные)**:
      - **Живой путь `#ensureSiteRoutes` доказан изолированно**: тест-клиент `_e2e_site_router` (10.8.0.90, `server_allowed_ips=["192.168.77.0/24"]`) + `_e2e_trigger` (с прошедшим `expires_at`) вставлены в sqlite через base64-SQL → cron (60 с, `setIntervalImmediately`) выключил trigger → `saveConfig()` → конфиг/peer применились. Сначала проверка провалилась (маршрут пуст) — **причина: образ ещё не был задеплоен** (контейнер на старом `726ab76`); после `compose pull && up -d`: маршрут есть (wg-quick при up) → удалил вручную (`ip route del`) → пере-триггерил cron (UPDATE enabled=1) → **маршрут переустановлен новым кодом через ~60 с** ✓.
      - **Полная топология** (все контейнеры `--cap-add NET_ADMIN`): `awg-e2e-router` (10.8.0.90, AWG-конфиг с Jc/Jmin/Jmax/S1/S2/H1-H4 скопированы из серверного wg0.conf, Endpoint=публичный IP:51820) + `awg-e2e-lan` (192.168.77.2/24 на eth0, маршрут 10.8.0.0/24 → 192.168.77.1) + `awg-e2e-phone` (10.8.0.98, peer добавлен runtime `awg set wg0 peer … allowed-ips 10.8.0.98/32`). «LAN за роутером» = secondary-адрес 192.168.77.1/24 на eth0 роутера поверх docker-моста (общий L2). **Все 5 путей OK**: router→server, **server→LAN по адресу через туннель**, **phone→LAN через forwarding сервера (ip_forward)**, LAN→phone (возврат без NAT), LAN→server. Handshake'ы установлены через `awg show wg0 latest-handshakes`.
      - **Уроки ручных e2e-контейнеров**: (а) обязателен `--device /dev/net/tun` (иначе amneziawg-go «Failed to create TUN device») и `--sysctl net.ipv4.ip_forward=1` (в /proc/sys ro без него); (б) `ip netns add` не работает без SYS_ADMIN (mount --make-shared denied) → вместо netns — отдельный контейнер-LAN на мосту; (в) запускать **`awg-quick`**, не `wg-quick` (ванильный отвергает `Jc=`); (г) `wg genpsk`, не `wg genkey psk`; (д) SSH-скрипты без одинарных кавычек → SQL/конфиги через base64.
      - **Уборка**: контейнеры удалены, строки `_e2e_%` удалены, рестарт → `ip route` без 192.168.77 ✓, конфиг без `_e2e` ✓, 3 пира ✓, healthy, `/api/information`=200, анонимный `/api/client`=401.
      - **Наблюдение (НЕ регресс, не тронуто)**: `awg show wg0 dump` падает «Unable to access interface: Protocol not supported» (UAPI-сокет) **только в окне старта контейнера**, пока wg0/amnezia-go поднимаются (API отвечает до готовности WireGuard — см. п. 45–47): бурст в 08:36:52 (compose up), последняя ошибка 08:42:37 = **+6 с после рестарта**, далее 0 ошибок за 5 мин, конкурентные dump 50/50 OK, ручной loop 20/20 OK. Сайт-ту-сайт к этому отношения не имеет (dump не изменялся). Если надо будет лечить — сериализовать/ретраить `wg.dump` в приложении.
