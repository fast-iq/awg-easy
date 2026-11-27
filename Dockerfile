FROM docker.io/library/node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS build

WORKDIR /app



# update corepack + enable pnpm

RUN npm install --global corepack@latest && corepack enable pnpm



# Copy Web UI

COPY src/package.json src/pnpm-lock.yaml src/pnpm-workspace.yaml ./

RUN pnpm install



# Build UI

COPY src ./

RUN pnpm build



# Build amneziawg-tools

RUN apk add --no-cache linux-headers build-base git && \

    git clone https://github.com/amnezia-vpn/amneziawg-tools.git && \

    cd amneziawg-tools/src && \

    make && \

    rm -rf /var/cache/apk/*



# Build amneziawg kernel module for Alpine linux-lts kernel (6.12.50)

FROM alpine:3.22@sha256:49340b346798875b5592e5d420241f2f9cfba5f47e62ebb1446a1b34734e898f AS kernel_module_builder

WORKDIR /build



# Install linux-lts kernel headers and build dependencies

RUN apk add --no-cache \

    git \

    linux-lts-dev \

    build-base \

    bc \

    elfutils-dev \

    wget \

    xz



# Get the actual LTS kernel version

RUN KERNEL_VERSION=$(apk info linux-lts-dev | grep 'linux-lts-dev-' | sed 's/linux-lts-dev-//;s/-r.*//' | head -1) && \

    echo "Building for kernel: $KERNEL_VERSION" && \

    echo "$KERNEL_VERSION" > /build/kernel_version.txt



# Clone the kernel module source

RUN git clone https://github.com/amnezia-vpn/amneziawg-linux-kernel-module.git



# Build the kernel module

WORKDIR /build/amneziawg-linux-kernel-module/src

RUN KERNEL_VERSION=$(cat /build/kernel_version.txt) && \

    make KERNELDIR="/usr/src/linux-headers-${KERNEL_VERSION}-0-lts" || \

    echo "Kernel module build failed, will use userspace fallback"



# Prepare module for installation

RUN mkdir -p /build/module && \

    if [ -f amneziawg.ko ]; then \

        cp amneziawg.ko /build/module/ && \

        echo "Kernel module built successfully"; \

    else \

        echo "No kernel module - will use userspace only"; \

    fi



# Build amneziawg-go userspace daemon (used by awg-quick when the kernel

# module is unavailable, e.g. non-Alpine hosts)

FROM --platform=$BUILDPLATFORM docker.io/library/golang:alpine@sha256:70bd7ddea8b6cbe5d6943cde279d6b67feb10cc924fb9100d1d8757c1575b280 AS amneziawg_go_builder

ARG TARGETARCH

RUN apk add --no-cache git make

RUN git clone --depth=1 https://github.com/amnezia-vpn/amneziawg-go.git /build && \

    cd /build && \

    go get -u ./... && go mod tidy && \

    GOOS=linux GOARCH=${TARGETARCH:-$(go env GOARCH)} CGO_ENABLED=0 make && \

    chmod +x /build/amneziawg-go



# Copy build result to a new image.

# This saves a lot of disk space.

FROM docker.io/library/node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5

WORKDIR /app



HEALTHCHECK --interval=1m --timeout=5s --retries=3 CMD /usr/bin/timeout 5s /bin/sh -c "(/usr/bin/wg show; /usr/bin/awg show) 2>/dev/null | /bin/grep -q interface || exit 1"



# Copy build

COPY --from=build /app/.output /app

# Copy migrations

COPY --from=build /app/server/database/migrations /app/server/database/migrations

# libsql (https://github.com/nitrojs/nitro/issues/3328)

#
# npm-installs libsql (native binary) ON TOP of the build's server node_modules.
# Do NOT delete node_modules first: since Nuxt 4.7 the server output is modular
# (vue, vue-router, pinia, zod, drizzle-orm, ... are runtime externals imported
# by the chunks). The old `rm -rf node_modules` (harmless on Nuxt 3, where nitro
# bundled everything) makes every container crash on boot with
# ERR_MODULE_NOT_FOUND 'vue' - caught by the PR smoke test.
#
# 'vue' also has to be installed explicitly: nitro's generated server
# package.json lists vue-router/pinia but NOT vue itself (it is only their
# PEER dependency), and any npm install prunes it as extraneous. Peer-dep
# auto-install is disabled here (--legacy-peer-deps semantics of the old
# command must stay off, but relying on npm peers across a hoisted pnpm
# tree is fragile), so vue is requested by name.
RUN cd /app/server && \

	if [ ! -d node_modules/vue-router ]; then npm cache clean --force || true; rm -rf node_modules; fi && \

	npm install --no-save --omit=dev --no-audit --no-fund libsql && \

	npm install --no-save --omit=dev --no-audit --no-fund vue && \

	if [ -f package-lock.json ]; then rm package-lock.json; fi && \

	rm -rf ~/.npm

# cli

COPY --from=build /app/cli/cli.sh /usr/local/bin/cli

RUN chmod +x /usr/local/bin/cli

# Copy amneziawg-tools

COPY --from=build /app/amneziawg-tools/src/wg /usr/bin/awg

COPY --from=build /app/amneziawg-tools/src/wg-quick/linux.bash /usr/bin/awg-quick

RUN chmod +x /usr/bin/awg /usr/bin/awg-quick

# Copy amneziawg-go userspace daemon (must be in PATH under this exact name —

# wg-quick/add_if falls back to `amneziawg-go <iface>` without the kernel module)

COPY --from=amneziawg_go_builder /build/amneziawg-go /usr/bin/amneziawg-go

RUN chmod +x /usr/bin/amneziawg-go



# Copy pre-built kernel module if available

COPY --from=kernel_module_builder /build/module /lib/modules/

COPY --from=kernel_module_builder /build/kernel_version.txt /etc/amneziawg-kernel-version.txt



# Install Linux packages

RUN apk add --no-cache \

    dpkg \

    dumb-init \

    iptables \

    ip6tables \

    nftables \

    kmod \

    iptables-legacy \

    wireguard-tools



RUN mkdir -p /etc/amnezia && \

    ln -s /etc/wireguard /etc/amnezia/amneziawg && \

    update-alternatives --install /usr/sbin/iptables iptables /usr/sbin/iptables-legacy 10 --slave /usr/sbin/iptables-restore iptables-restore /usr/sbin/iptables-legacy-restore --slave /usr/sbin/iptables-save iptables-save /usr/sbin/iptables-legacy-save && \

    update-alternatives --install /usr/sbin/ip6tables ip6tables /usr/sbin/ip6tables-legacy 10 --slave /usr/sbin/ip6tables-restore ip6tables-restore /usr/sbin/ip6tables-legacy-restore --slave /usr/sbin/ip6tables-save ip6tables-save /usr/sbin/ip6tables-legacy-save



# Set Environment

ENV DEBUG=Server,WireGuard,Database,CMD

ENV PORT=51821

ENV HOST=0.0.0.0

ENV INSECURE=false

ENV INIT_ENABLED=false

ENV DISABLE_IPV6=false



LABEL org.opencontainers.image.source=https://github.com/fast-iq/awg-easy



# Run Web UI

CMD ["/usr/bin/dumb-init", "node", "server/index.mjs"]
