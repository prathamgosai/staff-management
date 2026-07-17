-- 028_position_playbook_seed.sql
-- First-draft SOPs + KPIs for each active role. Every row lands with is_draft = TRUE:
-- this is restaurant best practice, NOT a record of how these kitchens actually run.
-- Managers correct it in the app and approve; only then does it describe reality.
--
-- Seeded by position NAME, so duplicate rows of the same role (there are currently two
-- 'Outlet Manager' positions, holding 35 and 7 staff) both receive identical content and
-- nobody is left without a playbook. Merging those rows is a separate decision.
--
-- Idempotent: re-running skips any (position, name) already present, so manager edits are
-- never overwritten.
BEGIN;

-- ── KPIs ─────────────────────────────────────────────────────────────────────
-- Applied to every active role, covering the five required areas. is_measurable_today
-- is the honest bit: TRUE only where the data source actually holds rows right now.
-- Anything reading attendance_records is FALSE — that table is empty until staff clock in.
INSERT INTO position_kpis (
  tenant_id, position_id, name, definition, formula, target_value, measurement_frequency,
  data_source, owner_label, reporting_format, below_target_action, category,
  is_measurable_today, sort_order
)
SELECT p.tenant_id, p.id, k.name, k.definition, k.formula, k.target_value, k.measurement_frequency,
       k.data_source, k.owner_label, k.reporting_format, k.below_target_action, k.category,
       k.is_measurable_today, k.sort_order
FROM positions p
CROSS JOIN (VALUES
  ('Punctuality rate',
   'Share of worked shifts where the staff member clocked in within the late-grace window of their rostered start.',
   '(shifts clocked in on time / shifts worked) x 100',
   '>= 95%', 'Weekly',
   'attendance_records.status + late_minutes, written on clock-in. NO DATA YET: nobody can clock in until a kiosk PIN is assigned and a kiosk device is registered.',
   'Outlet Manager', 'Weekly outlet review; per-staff breakdown from Reports.',
   'Talk to the staff member the same week. Two consecutive weeks below target: log it and agree a written plan.',
   'timeliness', FALSE, 1),

  ('Attendance rate',
   'Share of rostered shifts actually worked, excluding approved leave.',
   '(shifts worked / (shifts rostered - approved leave)) x 100',
   '>= 97%', 'Monthly',
   'attendance_records vs shift_assignments. NO DATA YET: attendance_records is empty (see Punctuality rate).',
   'Outlet Manager', 'Monthly report to HR.',
   'Check for a roster or transport problem before treating it as a discipline issue.',
   'throughput', FALSE, 2),

  ('Document compliance',
   'Share of this role''s mandatory documents (Aadhaar, PAN, bank details) held on file and unexpired.',
   '(mandatory docs on file / mandatory docs required) x 100',
   '100%', 'Monthly',
   'staff_documents vs document_types — LIVE DATA: visible today on the Document compliance page.',
   'HR', 'Monthly compliance report; gaps listed per staff member.',
   'Collect the missing document within 14 days. Escalate to HR if the staff member does not provide it.',
   'quality', TRUE, 3),

  ('Roster coverage',
   'Whether this role is staffed to its required level on the published roster.',
   '(staff rostered / staff required by the ratio model) x 100',
   '>= 100%', 'Weekly',
   'shift_assignments + staffing_ratios — LIVE DATA: 7,315 assignments on file.',
   'Outlet Manager', 'Weekly roster review before publishing.',
   'Fill the gap from the Expansion pool or a nearby outlet before publishing the roster.',
   'risk', TRUE, 4),

  ('Guest / internal feedback',
   'Complaints and compliments attributable to this role.',
   'complaints per 1,000 covers',
   'ASSUMPTION — set after one month of baseline data', 'Monthly',
   'NO SOURCE IN THIS APP: there is no guest feedback, CSAT or complaints table. Record manually until one exists.',
   'Outlet Manager', 'Monthly review, manual notes.',
   'Identify the specific step in the SOP that failed and retrain on it.',
   'satisfaction', FALSE, 5)
) AS k(name, definition, formula, target_value, measurement_frequency, data_source,
       owner_label, reporting_format, below_target_action, category, is_measurable_today, sort_order)
WHERE p.is_active
  AND NOT EXISTS (
    SELECT 1 FROM position_kpis x
     WHERE x.position_id = p.id AND x.name = k.name AND x.deleted_at IS NULL
  );

-- ── SOPs ─────────────────────────────────────────────────────────────────────
-- One opening SOP per role, written so a new starter can follow it. Action verbs, no
-- "ensure X" without saying how. Matched on position name.
INSERT INTO position_sops (
  tenant_id, position_id, name, purpose, inputs, procedure_steps, quality_checks,
  common_mistakes, exceptions_escalation, documentation, frequency, time_target,
  owner_label, sort_order
)
SELECT p.tenant_id, p.id, s.name, s.purpose, s.inputs, s.steps, s.checks, s.mistakes,
       s.exceptions, s.documentation, s.frequency, s.time_target, s.owner_label, 1
FROM positions p
JOIN (VALUES
  ('Cashier', 'Open the till and take payment',
   'Take payment accurately, and leave a till that reconciles at close.',
   'Opening float from the Outlet Manager; POS terminal powered on; your kiosk PIN.',
   ARRAY[
     'Clock in at the kiosk with your employee ID and PIN before touching the till.',
     'Count the opening float in front of the Outlet Manager. Both of you state the total aloud.',
     'Log in to the POS with your own user. Never use another person''s login.',
     'For each order: repeat the order back to the guest, take payment, hand over the printed bill.',
     'For card payments, hand the terminal to the guest. Do not type their PIN.',
     'At close, count the drawer twice. Record the total, expected total, and the difference.',
     'Hand the cash and the count sheet to the Outlet Manager. Clock out.'
   ],
   ARRAY['Drawer count matches POS expected total within Rs 100.', 'Every order has a printed bill.', 'Opening and closing counts are both signed by two people.'],
   ARRAY['Counting the float alone — always count with the manager present.', 'Sharing a POS login, which makes a shortfall untraceable.', 'Leaving the drawer unlocked while stepping away.'],
   'If the drawer is short by more than Rs 100, stop and call the Outlet Manager before recounting. Do not make up the difference from your own pocket. If the POS is down, write bills by hand in sequence and enter them once it is back.',
   'Count sheet signed by cashier + Outlet Manager, filed at the outlet.',
   'Every shift', 'Close count within 20 minutes of last order', 'Cashier', 1),

  ('Kitchen Helper', 'Prep station setup and hygiene',
   'Have the station stocked, clean and safe before service starts.',
   'Prep list from the Chef de Partie; delivery of the day; clean uniform.',
   ARRAY[
     'Clock in, wash hands for 20 seconds, put on a clean apron.',
     'Read the prep list. Ask the Chef de Partie about anything you cannot read or do not recognise.',
     'Check deliveries against the list: reject anything torn, thawed, or past its date, and tell the Chef de Partie immediately.',
     'Label every prepped item with the item name and the date it was prepped.',
     'Store raw meat below ready-to-eat food. Never above.',
     'Sanitise boards and knives between raw and cooked items.',
     'Report a fridge above 5C to the Chef de Partie at once — do not wait for service to end.'
   ],
   ARRAY['Every container is labelled and dated.', 'Fridge temperature logged at open and close.', 'No raw item stored above a cooked item.'],
   ARRAY['Labelling with only a date and no item name.', 'Using the same board for raw and cooked without sanitising.', 'Stacking deliveries on the floor.'],
   'Fridge above 5C, pest sighting, or suspected spoiled stock: stop using the item, tell the Chef de Partie and Head Chef immediately.',
   'Fridge temperature log; delivery rejection noted to the Chef de Partie.',
   'Every shift', 'Station ready 30 minutes before service', 'Kitchen Helper', 1),

  ('Kitchen Prep Staff', 'Daily prep to spec',
   'Produce prepped items to the same spec and quantity every day, so service does not run out.',
   'Prep list with quantities; recipe specs; yesterday''s carry-over count.',
   ARRAY[
     'Clock in and wash hands. Put on a clean apron.',
     'Count carry-over from yesterday before prepping anything new — prep the difference, not the full number.',
     'Follow the recipe spec for cut size and weight. Do not adjust it from memory.',
     'Weigh the first batch and check it against spec before continuing.',
     'Label and date every container. Rotate older stock to the front.',
     'Record the finished quantity on the prep sheet.',
     'Tell the Chef de Partie what you could not finish before you clock out.'
   ],
   ARRAY['First batch weighed against spec.', 'Prep sheet quantities filled in.', 'Older stock is in front of newer stock.'],
   ARRAY['Prepping the full number and ignoring carry-over, which creates waste.', 'Eyeballing cut sizes instead of weighing.', 'Leaving unfinished items unreported.'],
   'Short on an ingredient: tell the Chef de Partie before service, not during. Never substitute an ingredient without approval.',
   'Prep sheet with actual quantities, filed at the outlet.',
   'Daily', 'Prep complete 45 minutes before service', 'Kitchen Prep Staff', 1),

  ('Cook', 'Service line execution',
   'Send every dish to spec and at temperature, in ticket order.',
   'Station prepped and stocked; ticket rail; recipe specs.',
   ARRAY[
     'Clock in and check your station against the prep list before the first ticket.',
     'Call back every ticket out loud so the Chef de Partie knows it is heard.',
     'Cook to the spec temperature. Probe meat — do not judge by colour.',
     'Fire dishes so that one table''s food lands together.',
     'Wipe the plate rim before it leaves the pass.',
     'Tell the Chef de Partie the moment you are 86 on an item.',
     'Clean down your station and log fridge temperatures before clocking out.'
   ],
   ARRAY['Meat probed to spec temperature.', 'One table''s dishes leave together.', 'Station cleaned down and logged.'],
   ARRAY['Judging doneness by colour instead of probing.', 'Silently running out of an item mid-service.', 'Plating on an unwiped rim.'],
   'If a dish comes back, remake it — do not argue with service. Tell the Chef de Partie so the cause gets fixed. If equipment fails, tell the Head Chef immediately.',
   'Temperature log; 86 board updated.',
   'Every shift', 'Ticket to pass: 15 minutes', 'Cook', 1),

  ('Chef de Partie', 'Run the section through service',
   'Keep the section to spec and on time, and develop the staff on it.',
   'Section staffed and prepped; covers forecast; ticket rail.',
   ARRAY[
     'Check the section prep against the covers forecast before service. Flag a shortfall to the Head Chef now, not at 8pm.',
     'Brief your staff on specials, 86s and expected covers.',
     'Taste the base preparations before service starts.',
     'Call the pass for your section and hold dishes that are not to spec.',
     'Watch ticket times. If they exceed target, rebalance staff across the section.',
     'Debrief the section for two minutes at close: what ran out, what came back, what to change.',
     'Log 86s and waste before you leave.'
   ],
   ARRAY['Base preparations tasted before service.', 'No dish leaves the section off-spec.', 'Waste and 86s logged.'],
   ARRAY['Only tasting once service has begun.', 'Letting a marginal dish through to keep ticket time.', 'Skipping the close debrief.'],
   'Ticket times more than double target, or a staff member walks out mid-service: call the Head Chef immediately.',
   'Waste log; 86 log; notes for the Head Chef.',
   'Every shift', 'Section ticket time within target', 'Chef de Partie', 1),

  ('Head Chef', 'Kitchen open and close',
   'Open a kitchen that is safe and stocked, and close one that is clean and accounted for.',
   'Covers forecast; staff roster; delivery schedule; yesterday''s waste and 86 logs.',
   ARRAY[
     'Read yesterday''s waste and 86 logs before ordering anything.',
     'Check the roster against the covers forecast. Fix a shortfall before service, not during.',
     'Walk every fridge and freezer. Log temperatures. Act on anything above 5C immediately.',
     'Brief the kitchen: covers, specials, 86s, who is on which section.',
     'Spot-check two dishes at the pass during peak.',
     'At close, walk the kitchen for cleanliness and sign the checklist.',
     'Record waste, 86s and any incident before you leave.'
   ],
   ARRAY['All fridge temperatures logged, open and close.', 'Close checklist signed.', 'Waste recorded with a reason, not just a number.'],
   ARRAY['Ordering without reading the waste log, which repeats the same over-order.', 'Briefing only the senior staff.', 'Signing the close checklist without walking the kitchen.'],
   'Food safety incident, injury, or equipment failure affecting service: tell the Restaurant Manager the same day and record it in writing.',
   'Temperature logs; waste log; close checklist; incident note.',
   'Daily', 'Open checks complete 60 minutes before service', 'Head Chef', 1),

  ('R&D Chef', 'New dish development and handover',
   'Take a dish from idea to a spec the line can cook identically every time.',
   'Brief from the Restaurant Manager; target food cost; allergen list.',
   ARRAY[
     'Write the target cost and the allergen list before you cook anything.',
     'Cost the dish per portion at real supplier prices, not estimates.',
     'Cook it three times. If the three differ, the spec is not finished.',
     'Write the spec: weights, cut sizes, cook times, probe temperature, plating photo.',
     'Test it once on a live section at peak, not in a quiet kitchen.',
     'Hand over to the Head Chef in person and walk them through the spec.',
     'Record the allergens on the final spec sheet.'
   ],
   ARRAY['Three identical test cooks.', 'Portion cost within target.', 'Allergens listed on the spec.'],
   ARRAY['Handing over a spec without a photo, so plating drifts within a week.', 'Costing with estimated prices.', 'Testing only in a quiet kitchen.'],
   'If the dish cannot hit the target cost, take it back to the Restaurant Manager with options — do not quietly shrink the portion.',
   'Spec sheet with photo, costing and allergens, held by the Head Chef.',
   'On demand', '3 test cooks before handover', 'R&D Chef', 1),

  ('Service Crew', 'Table service cycle',
   'Give every table the same greeting, accuracy and pace.',
   'Section assignment; specials and 86 list; clean uniform.',
   ARRAY[
     'Clock in and read the specials and 86 list before your first table.',
     'Greet the table within 2 minutes of them sitting.',
     'Repeat the order back before sending it to the kitchen.',
     'Ask about allergies before sending any order. Write the answer on the ticket.',
     'Check back once, two minutes after the food lands.',
     'Clear plates only when everyone at the table has finished.',
     'Reset the table within 3 minutes of it leaving.'
   ],
   ARRAY['Table greeted within 2 minutes.', 'Allergy question asked and written on every ticket.', 'Order repeated back before firing.'],
   ARRAY['Sending an order without asking about allergies.', 'Clearing one guest''s plate while others still eat.', 'Promising a kitchen timing you have not checked.'],
   'Allergy reaction: stop, tell the Outlet Manager immediately, do not serve the table anything further. Complaint you cannot resolve in one step: get the Outlet Manager, do not negotiate alone.',
   'Allergy noted on the ticket; complaint logged with the Outlet Manager.',
   'Every shift', 'Greet within 2 min; reset within 3 min', 'Service Crew', 1),

  ('Senior Service Crew', 'Run the floor section',
   'Hold service standards across the section and coach the crew on it.',
   'Section plan; reservation book; specials and 86 list.',
   ARRAY[
     'Read the reservation book and plan the section before doors open.',
     'Brief the crew on specials, 86s and large bookings.',
     'Walk the section every 10 minutes during service.',
     'Take over any table where a guest has raised a complaint.',
     'Watch for tables waiting more than 5 minutes without contact and step in.',
     'Debrief the crew for two minutes at close.',
     'Report repeat complaints to the Outlet Manager with the specific cause.'
   ],
   ARRAY['Section walked at least every 10 minutes.', 'Every complaint personally handled or escalated.', 'Crew debriefed at close.'],
   ARRAY['Working tables instead of running the section.', 'Handling a complaint without telling the Outlet Manager.', 'Briefing after doors open.'],
   'Guest refuses to pay, or any safety incident: call the Outlet Manager immediately and write it up the same shift.',
   'Complaint notes to the Outlet Manager; section debrief points.',
   'Every shift', 'Section walk every 10 min', 'Senior Service Crew', 1),

  ('Assistant Manager', 'Shift open and handover',
   'Start the shift ready and hand it over with nothing lost.',
   'Roster; float; previous shift handover notes; reservation book.',
   ARRAY[
     'Read the previous handover notes before anything else.',
     'Check the roster against who has actually clocked in. Chase anyone missing within 15 minutes of their start.',
     'Count and issue the float with the cashier present.',
     'Walk the floor and kitchen. Note anything broken or missing.',
     'Brief the team: covers, specials, 86s, staffing gaps.',
     'Write the handover during the shift, not from memory at the end.',
     'Hand over in person to the next manager. Do not leave notes on a desk.'
   ],
   ARRAY['Handover written during the shift.', 'Float counted with two people.', 'Absences chased within 15 minutes.'],
   ARRAY['Writing the handover from memory at close.', 'Leaving the handover as a note instead of in person.', 'Not chasing a no-show until service starts.'],
   'No-show that leaves the section below minimum: call the Outlet Manager immediately and try the Expansion pool before service.',
   'Written handover; float count sheet; incident notes.',
   'Every shift', 'Handover complete before you leave', 'Assistant Manager', 1),

  ('Outlet Manager', 'Daily outlet open, run and close',
   'Run a shift that is staffed, compliant and accounted for.',
   'Roster; covers forecast; float; handover notes; pending leave requests.',
   ARRAY[
     'Read the handover and yesterday''s incidents before opening.',
     'Check the roster against the covers forecast. Fill any gap before doors open.',
     'Confirm every rostered staff member has clocked in. Follow up on anyone missing within 15 minutes.',
     'Walk the outlet: cleanliness, fridge temperatures, signage, safety.',
     'Brief the team: covers, specials, staffing, anything from yesterday.',
     'Review pending leave requests before the roster for next week is generated.',
     'At close, reconcile the till, sign the close checklist, and write the handover.'
   ],
   ARRAY['Till reconciles within Rs 100.', 'Close checklist signed after a physical walk.', 'Handover written the same shift.'],
   ARRAY['Approving next week''s roster without checking pending leave, which creates a gap.', 'Signing the checklist without walking the outlet.', 'Leaving a till variance to sort out tomorrow.'],
   'Till variance over Rs 500, injury, food safety incident, or a section below minimum staffing: tell the Restaurant Manager the same day, in writing.',
   'Close checklist; till reconciliation; handover; incident report.',
   'Daily', 'Close reconciliation within 30 min of close', 'Outlet Manager', 1),

  ('ODC Staff', 'Outdoor catering dispatch',
   'Get an off-site event out complete, at temperature, and back accounted for.',
   'Event sheet with guest count and menu; packing list; transport booking.',
   ARRAY[
     'Read the event sheet and confirm the guest count with the Outlet Manager the day before.',
     'Pack against the packing list and tick each item physically — do not tick from memory.',
     'Probe and record hot food temperature at the moment of packing.',
     'Load hot and cold in separate insulated boxes.',
     'Photograph the loaded vehicle before it leaves.',
     'On site, probe and record temperature again before serving.',
     'Count equipment back in on return and report anything missing the same day.'
   ],
   ARRAY['Packing list ticked item by item.', 'Temperature recorded at pack and at site.', 'Equipment counted back on return.'],
   ARRAY['Ticking the packing list from memory after loading.', 'Packing hot and cold together.', 'Reporting missing equipment days later.'],
   'Hot food below 60C on arrival: do not serve it. Call the Head Chef immediately. Vehicle breakdown: call the Outlet Manager at once — do not wait to see if you can make up time.',
   'Event sheet with temperatures; equipment count; photos.',
   'Per event', 'Temperature check at pack and on arrival', 'ODC Staff', 1),

  ('Part-Time Crew', 'Shift basics for part-time crew',
   'Give a part-time shift the same standard as a full-time one.',
   'Roster; your kiosk PIN; the task list from your Outlet Manager.',
   ARRAY[
     'Confirm your shift on the roster the day before.',
     'Clock in at the kiosk with your employee ID and PIN. Clock out at the end — an open punch is not a completed shift.',
     'Ask the Outlet Manager for your task list at the start, not halfway through.',
     'Follow the SOP for the task you are given, the same as full-time crew.',
     'Ask before improvising. There is no penalty for asking.',
     'Tell the Outlet Manager what you did not finish before you leave.',
     'Give at least 24 hours'' notice if you cannot make a shift.'
   ],
   ARRAY['Clocked in and out on the kiosk.', 'Task list confirmed at the start of the shift.', 'Unfinished work reported before leaving.'],
   ARRAY['Forgetting to clock out, which leaves the shift unrecorded.', 'Improvising instead of asking.', 'Cancelling a shift on the day.'],
   'If you cannot make a shift, tell the Outlet Manager as early as you can so the gap can be filled from the Expansion pool.',
   'Kiosk clock-in/out record.',
   'Every shift', 'Clock in before shift start', 'Part-Time Crew', 1)
) AS s(role, name, purpose, inputs, steps, checks, mistakes, exceptions, documentation, frequency, time_target, owner_label)
  ON p.name = s.role
WHERE p.is_active
  AND NOT EXISTS (
    SELECT 1 FROM position_sops x
     WHERE x.position_id = p.id AND x.name = s.name AND x.deleted_at IS NULL
  );

COMMIT;
