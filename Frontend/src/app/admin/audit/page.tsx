"use client";

import { PageHeader, Spinner, TableWrap, THead } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { fmtDateTime } from "@/lib/utils";
import { services } from "@/services";

export default function AuditPage() {
  const { data, loading } = useAsync(() => services.admin.audit());
  return (
    <>
      <PageHeader title="Audit log" subtitle="Sensitive actions across the system" />
      {loading ? (
        <Spinner />
      ) : (
        <TableWrap>
          <THead cols={["When", "Actor", "Action", "Target"]} />
          <tbody>
            {data?.map((a) => (
              <tr key={a.id} className="border-b border-slate-100">
                <td className="td whitespace-nowrap">{fmtDateTime(a.at)}</td>
                <td className="td">{a.actor}</td>
                <td className="td">{a.action}</td>
                <td className="td">{a.target}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
