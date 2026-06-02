FROM node:20-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates git tini \
 && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    CI=1 \
    WATCHPACK_POLLING=true

# Bake Chromium + its system deps. --with-deps runs apt-get internally, so refresh
# the apt lists right before and clean them after. Chown so the runtime `node` user
# can read/write the cache.
RUN apt-get update \
 && npx --yes playwright@1.49.1 install --with-deps chromium \
 && chown -R node:node /ms-playwright \
 && rm -rf /var/lib/apt/lists/* /tmp/* /root/.npm

# Vercel CLI, installed globally so `vercel dev` (CRA dev server + the
# /api/claude serverless proxy) is on PATH for the runtime `node` user. This is
# the dev box's documented dev-server command (scripts/dev vercel dev).
RUN npm install -g vercel && rm -rf /root/.npm

WORKDIR /workspace
RUN chown node:node /workspace

USER node

EXPOSE 3000

ENTRYPOINT ["tini", "--"]
CMD ["sleep", "infinity"]
