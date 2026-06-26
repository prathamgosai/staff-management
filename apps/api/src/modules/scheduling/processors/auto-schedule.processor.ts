import { Processor, Process } from "@nestjs/bull";
import { Job } from "bull";
import { Inject, Logger } from "@nestjs/common";
import { Pool } from "pg";
import { DB_POOL } from "../../../database/database.module";

@Processor("auto-schedule")
export class AutoScheduleProcessor {
  private readonly logger = new Logger(AutoScheduleProcessor.name);

  constructor(@Inject(DB_POOL) private readonly db: Pool) {}

  @Process("generate")
  async handleGenerate(job: Job<{ tenantId: string; outletId: string; weekStartDate: string; userId: string }>) {
    const { outletId, weekStartDate, userId } = job.data;
    this.logger.log(`Auto-generating schedule for outlet ${outletId}, week ${weekStartDate}`);

    try {
      // 1. Create or reset schedule
      const schedResult = await this.db.query(
        `INSERT INTO schedules (outlet_id, week_start_date, week_end_date, status, auto_generated, created_by)
         VALUES ($1, $2, $2::date + 6, 'draft', true, $3)
         ON CONFLICT (outlet_id, week_start_date) DO UPDATE SET status = 'draft', auto_generated = true
         RETURNING id`,
        [outletId, weekStartDate, userId],
      );
      const scheduleId = schedResult.rows[0].id;

      // 2. Fetch shift templates
      const templates = await this.db.query(
        "SELECT * FROM shift_templates WHERE outlet_id = $1 AND is_active = true",
        [outletId],
      );

      // 3. Fetch active staff for this outlet
      const staffResult = await this.db.query(
        `SELECT id, weekly_hours FROM staff
         WHERE current_outlet_id = $1 AND employment_status = 'active'
         ORDER BY RANDOM()`,
        [outletId],
      );

      // 4. For each day of the week, create shifts from templates
      const weekDays = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStartDate);
        d.setDate(d.getDate() + i);
        return d.toISOString().split("T")[0];
      });

      for (const date of weekDays) {
        // Check approved leave on this date
        const onLeave = await this.db.query(
          `SELECT staff_id FROM leave_requests
           WHERE status = 'approved' AND $1 BETWEEN start_date AND end_date`,
          [date],
        );
        const onLeaveIds = new Set(onLeave.rows.map((r: { staff_id: string }) => r.staff_id));
        const availableStaff = staffResult.rows.filter((s: { id: string }) => !onLeaveIds.has(s.id));

        for (const template of templates.rows) {
          const shift = await this.db.query(
            `INSERT INTO schedule_shifts (schedule_id, template_id, outlet_id, date,
               start_time, end_time, break_minutes, is_overnight, min_staff, target_staff, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft') RETURNING id`,
            [scheduleId, template.id, outletId, date,
             template.start_time, template.end_time, template.break_minutes,
             template.is_overnight, template.min_staff, template.target_staff],
          );
          const shiftId = shift.rows[0].id;

          // Assign up to target_staff from available pool (round-robin)
          const toAssign = availableStaff.slice(0, template.target_staff);
          for (const staff of toAssign) {
            await this.db.query(
              `INSERT INTO shift_assignments (shift_id, staff_id, status)
               VALUES ($1, $2, 'draft') ON CONFLICT DO NOTHING`,
              [shiftId, staff.id],
            );
          }
        }
      }

      await job.progress(100);
      this.logger.log(`Schedule ${scheduleId} auto-generated for outlet ${outletId}`);
      return { scheduleId };
    } catch (err) {
      this.logger.error("Auto-schedule generation failed", err);
      throw err;
    }
  }
}
