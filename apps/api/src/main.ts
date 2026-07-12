// Pin the process timezone BEFORE anything computes a Date. The week-key / date helpers
// format from LOCAL components to match the web client (India). On a UTC host (Render)
// that local was UTC, so a just-after-IST-midnight moment could land on the wrong day.
// Aligns the Node process with the DB session TZ (see database.module APP_TZ).
process.env.TZ = process.env.TZ || process.env.APP_TZ || "Asia/Kolkata";

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import * as compression from "compression";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ["error", "warn", "log"],
  });
  const config = app.get(ConfigService);

  // Accept larger JSON bodies so base64 uploads aren't rejected — profile photos and now
  // staff documents up to MAX_DOCUMENT_BYTES (default 10 MB → ~13.4 MB base64 + envelope).
  const jsonLimit = config.get<string>("MAX_JSON_BODY", "16mb");
  app.useBodyParser("json", { limit: jsonLimit });
  app.useBodyParser("urlencoded", { limit: jsonLimit, extended: true });

  app.use(helmet());
  app.use(compression());

  // CORS: allow the configured production origin(s) — APP_URL may be a
  // comma-separated list — plus any localhost / 127.0.0.1 origin (any port) in
  // development. A single hard-coded origin silently broke login whenever the
  // app was opened as 127.0.0.1, a LAN alias, or an alternate port (3001 when
  // 3000 was taken): the browser blocked the response and the SPA only saw a
  // generic network error.
  const allowedOrigins = config
    .get<string>("APP_URL", "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const isProduction = config.get("NODE_ENV") === "production";
  const localhostOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  app.enableCors({
    origin: (origin, callback) => {
      // Non-browser clients (curl, mobile apps, server-to-server) send no Origin.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (!isProduction && localhostOrigin.test(origin)) return callback(null, true);
      // Deny quietly: omit CORS headers (the browser blocks the read) without
      // throwing, which would surface as a noisy 500 on every cross-origin probe.
      return callback(null, false);
    },
    credentials: true,
  });

  app.setGlobalPrefix(config.get("API_PREFIX", "api/v1"));
  app.enableVersioning({ type: VersioningType.URI });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Map raw Postgres errors to correct HTTP statuses and stamp a request id on every
  // error response (see AllExceptionsFilter). Registered after the pipe so ValidationPipe
  // 400s still pass through untouched.
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle("WorkforceIQ API")
    .setDescription("Restaurant Workforce & Operations Planning Platform")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  // Render (and most PaaS) inject the port to bind via $PORT; fall back to API_PORT locally.
  const port = process.env.PORT ? Number(process.env.PORT) : config.get<number>("API_PORT", 4000);
  await app.listen(port, "0.0.0.0");
  console.log(`WorkforceIQ API running on http://localhost:${port}/api/v1`);
  console.log(`Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
