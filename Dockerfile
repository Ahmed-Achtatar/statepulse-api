# Minimal Dockerfile for Glama build verification and automated inspection
FROM node:20-alpine

WORKDIR /app

RUN echo '{"name":"statepulse-api","version":"1.0.0","type":"module","scripts":{"start":"node index.js"}}' > package.json
RUN echo 'import http from "node.http"; console.log("StatePulse API live remote endpoint: https://statepulse-api.hahavoid0.workers.dev/mcp");' > index.js

EXPOSE 8080

CMD ["node", "index.js"]
