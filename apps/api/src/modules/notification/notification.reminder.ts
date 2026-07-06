import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { formatError } from "../../common/utils/format-error";
import {
  NOTIFICATIONS_QUEUE, REMINDER_CRON_JOB, REMINDER_JOB_ID, REMINDER_CRON, REMINDER_TZ,
} from "./notification.constants";

/**
 * Registers the nightly shift-reminder as a Bull REPEATABLE job on the notifications
 * queue. A fixed jobId means restarts re-register the same schedule (Bull dedupes the
 * repeat key) rather than stacking duplicate fires. Runs single-consumer via Redis, so
 * it doesn't double-fire when the API is scaled to multiple instances (unlike an
 * in-process @nestjs/schedule @Cron). The @Process(REMINDER_CRON_JOB) handler does the
 * work; if Redis is unreachable at boot we log and carry on rather than crash startup.
 */
@Injectable()
export class ReminderScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReminderScheduler.name);

  constructor(@InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.queue.add(
        REMINDER_CRON_JOB,
        {},
        {
          repeat: { cron: REMINDER_CRON, tz: REMINDER_TZ },
          jobId: REMINDER_JOB_ID,
          removeOnComplete: true,
          removeOnFail: 20,
        },
      );
      this.logger.log(`Nightly shift reminders scheduled at "${REMINDER_CRON}" (${REMINDER_TZ})`);
    } catch (e) {
      this.logger.error(`Could not schedule nightly shift reminders: ${formatError(e)}`);
    }
  }
}
