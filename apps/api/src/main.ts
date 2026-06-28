import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import * as compression from "compression";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ["error", "warn", "log"],
  });
  const config = app.get(ConfigService);

  // Accept larger JSON bodies so base64 profile-photo uploads aren't rejected
  app.useBodyParser("json", { limit: "8mb" });
  app.useBodyParser("urlencoded", { limit: "8mb", extended: true });

  app.use(helmet());
  app.use(compression());
  app.enableCors({
    origin: config.get("APP_URL", "http://localhost:3000"),
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
