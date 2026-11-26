import { USE_MOCK } from "@/lib/http";
import { apiServices } from "./api";
import { mockServices } from "./mock";

/** Single switch point between demo data and a real backend. */
export const services = USE_MOCK ? mockServices : apiServices;
