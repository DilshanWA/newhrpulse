"use client";

import { Button, Avatar, Badge, PageHeader, Spinner, TableWrap, THead } from "@/components/ui";
import { useConfirm } from "@/components/ui/confirm";
import { useAsync } from "@/hooks/useAsync";
import { useSession } from "@/hooks/useSession";
import { withYouLabel } from "@/lib/utils";
import { services } from "@/services";

export default function UsersPage() {
  const { user } = useSession();
  const confirm = useConfirm();
  const { data, loading, refresh } = useAsync(() => services.admin.users());

  async function setActive(userId: string, name: string, isActive: boolean) {
    const ok = await confirm({
      title: `${isActive ? "Reactivate" : "Deactivate"} ${name}'s account?`,
      message: isActive
        ? "This user will be able to sign in and use HR Pulse again."
        : "This immediately blocks sign-in and HR Pulse access. Employee records and history are kept.",
      confirmLabel: isActive ? "Reactivate account" : "Deactivate account",
      tone: isActive ? "info" : "danger",
      action: () => services.admin.setActive(userId, isActive, user?.name ?? "unknown"),
    });
    if (ok) refresh();
  }

  return (
    <>
      <PageHeader title="Users" subtitle="Manage account access. Deactivation preserves employee records and history." />
      {loading ? (
        <Spinner />
      ) : (
        <TableWrap>
          <THead cols={["User", "Email", "Role", "Account", "Actions"]} />
          <tbody>
            {data?.map((u) => {
              const isActive = u.isActive !== false;
              const canManage = !!user && u.id !== user.id && u.role !== "superadmin" &&
                (user.role === "superadmin" || u.role === "employee");
              return (
                <tr key={u.id} className="border-b border-slate-100">
                  <td className="td"><span className="flex items-center gap-3"><Avatar name={u.name} src={u.avatarUrl} />{withYouLabel(u.name, u.id === user?.id)}</span></td>
                  <td className="td">{u.email}</td>
                  <td className="td"><Badge tone={u.role === "superadmin" ? "violet" : u.role === "admin" ? "blue" : "slate"}>{u.role}</Badge></td>
                  <td className="td"><Badge tone={isActive ? "green" : "red"}>{isActive ? "Active" : "Deactivated"}</Badge></td>
                  <td className="td">
                    {canManage ? (
                      <Button
                        size="sm"
                        variant={isActive ? "danger" : "secondary"}
                        onClick={() => setActive(u.id, u.name, !isActive)}
                      >
                        {isActive ? "Deactivate" : "Reactivate"}
                      </Button>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
