"use client";

import { PageHeader, Spinner, TableWrap, THead } from "@/components/ui";
import { useConfirm } from "@/components/ui/confirm";
import type { Role, User } from "@/domain/types";
import { useAsync } from "@/hooks/useAsync";
import { useSession } from "@/hooks/useSession";
import { withYouLabel } from "@/lib/utils";
import { services } from "@/services";

const ROLE_LABEL: Record<Role, string> = { employee: "Employee", admin: "Admin", superadmin: "Super Admin" };
const ROLE_EFFECT: Record<Role, string> = {
  employee: "They will only see their own attendance, leave and pay.",
  admin: "They will be able to manage employees, approve leave, run payroll and see everyone's attendance.",
  superadmin: "They will have full access, including changing other people's roles and reading the audit log.",
};

export default function RolesPage() {
  const { user } = useSession();
  const confirm = useConfirm();
  const { data, loading, refresh } = useAsync(() => services.admin.users());

  async function changeRole(u: User, role: Role) {
    if (role === u.role) return;
    const ok = await confirm({
      title: `Make ${u.name} ${role === "admin" ? "an" : "a"} ${ROLE_LABEL[role]}?`,
      message: (
        <>
          {ROLE_LABEL[u.role]} → <b className="text-slate-700">{ROLE_LABEL[role]}</b>. {ROLE_EFFECT[role]}
        </>
      ),
      confirmLabel: "Change role",
      tone: role === "superadmin" || u.role === "superadmin" ? "danger" : "warning",
      action: () => services.admin.setRole(u.id, role, user?.name ?? "unknown"),
    });
    // The select is controlled by the saved role, so cancelling leaves it unchanged.
    if (ok) refresh();
  }

  return (
    <>
      <PageHeader title="Roles & permissions" subtitle="Super Admin only. Changes are written to the audit log." />
      {loading ? (
        <Spinner />
      ) : (
        <TableWrap>
          <THead cols={["User", "Email", "Role"]} />
          <tbody>
            {data?.map((u) => (
              <tr key={u.id} className="border-b border-slate-100">
                <td className="td">{withYouLabel(u.name, u.id === user?.id)}</td>
                <td className="td">{u.email}</td>
                <td className="td">
                  <select
                    className="input w-40 py-1.5"
                    value={u.role}
                    disabled={u.id === user?.id}
                    aria-label={`Role for ${u.name}`}
                    onChange={(e) => changeRole(u, e.target.value as Role)}
                  >
                    {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                      <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
