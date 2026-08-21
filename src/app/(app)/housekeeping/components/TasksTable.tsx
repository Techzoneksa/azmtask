"use client";

import Link from "next/link";

import { Badge, Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import {
  HOUSEKEEPING_STATUS,
  HOUSEKEEPING_TASK_STATUS,
  HOUSEKEEPING_TASK_TYPE,
  PRIORITY,
  statusMeta,
} from "@/lib/status";
import type { HousekeepingTaskRow } from "@/server/services/housekeeping.service";

import { TaskActions, type TaskActionCapabilities } from "./TaskActions";
import { TaskCard, formatAge } from "./TaskCard";

/**
 * The same work as a table, for a supervisor at a desk.
 *
 * Below `md` it is not a table at all: the cards render instead. A nine-column grid on
 * a 390px screen is either unreadably small or scrolls sideways, and both are worse
 * than the card the phone user already has.
 */
export function TasksTable({
  rows,
  employees,
  capabilities,
}: {
  rows: HousekeepingTaskRow[];
  employees: Array<{ id: string; name: string; openTasks?: number }>;
  capabilities: TaskActionCapabilities;
}) {
  return (
    <>
      <div className="grid gap-3 md:hidden">
        {rows.map((task) => (
          <TaskCard key={task.id} task={task} employees={employees} capabilities={capabilities} />
        ))}
      </div>

      <div className="hidden md:block">
        <TableWrap>
          <Table>
            <caption className="sr-only">مهام النظافة</caption>
            <THead>
              <TR>
                <TH>الوحدة</TH>
                <TH>الحالة</TH>
                <TH>المهمة</TH>
                <TH>الأولوية</TH>
                <TH>الموظف</TH>
                <TH>وقت الإنشاء</TH>
                <TH>وقت البدء</TH>
                <TH>آخر تحديث</TH>
                <TH>الإجراءات</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((task) => {
                const room = statusMeta(HOUSEKEEPING_STATUS, task.housekeepingStatus);
                const work = statusMeta(HOUSEKEEPING_TASK_STATUS, task.status);
                const priority = statusMeta(PRIORITY, task.priority);
                const type = statusMeta(HOUSEKEEPING_TASK_TYPE, task.taskType);

                return (
                  <TR key={task.id}>
                    <TD>
                      <Link
                        href={`/housekeeping/${task.id}`}
                        className="font-medium tabular-nums text-content hover:underline"
                      >
                        {task.unitNumber}
                      </Link>
                      <span className="mt-0.5 block text-[12px] text-content-subtle">
                        {task.floor === null ? "—" : `الطابق ${task.floor}`} · {task.unitTypeName}
                      </span>
                    </TD>
                    <TD>
                      <Badge tone={room.tone as never}>{room.label}</Badge>
                    </TD>
                    <TD>
                      <Badge tone={work.tone as never}>{work.label}</Badge>
                      <span className="mt-0.5 block text-[12px] text-content-subtle">
                        {type.label}
                      </span>
                    </TD>
                    <TD>
                      <Badge tone={priority.tone as never}>{priority.label}</Badge>
                    </TD>
                    <TD>
                      {task.assigneeName ?? (
                        <span className="text-[12px] text-warn-fg">غير مسندة</span>
                      )}
                    </TD>
                    <TD>
                      <span className="text-[12px] tabular-nums text-content-muted">
                        {formatDateTime(task.createdAt)}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-content-subtle">
                        مضى {formatAge(task.ageMinutes)}
                      </span>
                    </TD>
                    <TD>
                      <span className="text-[12px] tabular-nums text-content-muted">
                        {task.startedAt ? formatDateTime(task.startedAt) : "—"}
                      </span>
                    </TD>
                    <TD>
                      <span className="text-[12px] tabular-nums text-content-muted">
                        {formatDateTime(task.updatedAt)}
                      </span>
                    </TD>
                    <TD>
                      <TaskActions
                        task={{
                          id: task.id,
                          unitNumber: task.unitNumber,
                          status: task.status,
                          assigneeId: task.assigneeId,
                        }}
                        employees={employees}
                        capabilities={capabilities}
                      />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableWrap>
      </div>
    </>
  );
}
