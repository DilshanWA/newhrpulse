/** Single-user demo data for HrPulse. */
import type { User } from "@/domain/types";

export const DEMO_USERS: (User & { title: string })[] = [
  {
    id: "u1",
    name: "Samantha Perera Test",
    email: "admin@hrpulse.demo",
    role: "admin",
    title: "HR Administrator",
    employeeId: "e1",
  },
];