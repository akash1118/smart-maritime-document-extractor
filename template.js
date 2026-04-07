const fs = require("fs");
const path = require("path");

const structure = {
  src: {
    "app.ts": "",
    "server.ts": "",
    config: {
      "env.ts": "",
    },
    routes: {
      "extract.routes.ts": "",
      "jobs.routes.ts": "",
      "sessions.routes.ts": "",
      "health.routes.ts": "",
    },
    controllers: {
      "extract.controller.ts": "",
      "jobs.controller.ts": "",
      "sessions.controller.ts": "",
    },
    services: {
      "extraction.service.ts": "",
      "validation.service.ts": "",
      "report.service.ts": "",
      "job.service.ts": "",
      "dedup.service.ts": "",
    },
    llm: {
      "base.client.ts": "",
      "gemini.client.ts": "",
      "openai.client.ts": "",
      "llm.factory.ts": "",
    },
    db: {
      prisma: {
        "schema.prisma": "",
      },
      repositories: {
        "extraction.repo.ts": "",
        "job.repo.ts": "",
        "session.repo.ts": "",
      },
    },
    workers: {
      "job.worker.ts": "",
    },
    middlewares: {
      "rateLimiter.ts": "",
      "errorHandler.ts": "",
    },
    utils: {
      "hash.util.ts": "",
      "jsonParser.ts": "",
      "logger.ts": "",
    },
    types: {
      "index.ts": "",
    },
  },

  "package.json": JSON.stringify(
    {
      name: "smde-backend",
      version: "1.0.0",
      main: "dist/server.js",
      scripts: {
        dev: "ts-node-dev --respawn src/server.ts",
        build: "tsc",
        start: "node dist/server.js",
      },
    },
    null,
    2,
  ),

  "tsconfig.json": JSON.stringify(
    {
      compilerOptions: {
        target: "ES2020",
        module: "commonjs",
        rootDir: "src",
        outDir: "dist",
        esModuleInterop: true,
        strict: true,
      },
    },
    null,
    2,
  ),
};

// Recursive function to create structure
function createStructure(basePath, obj) {
  for (const key in obj) {
    const fullPath = path.join(basePath, key);

    if (typeof obj[key] === "string") {
      fs.writeFileSync(fullPath, obj[key]);
      console.log("📄 File created:", fullPath);
    } else {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log("📁 Folder created:", fullPath);
      createStructure(fullPath, obj[key]);
    }
  }
}

// Run script
createStructure(process.cwd(), structure);

console.log("\n✅ Project structure created successfully!");
