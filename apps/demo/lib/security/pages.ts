import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ApiError, requireUser } from "./http";
export const requirePageUser = async () => {
  try {
    return await requireUser(
      new Request("http://internal", { headers: await headers() })
    );
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      redirect("/login");
    }
    throw error;
  }
};
export const requirePageAdmin = async () => {
  try {
    const account = await requireUser(
      new Request("http://internal", { headers: await headers() })
    );
    if (account.role !== "admin" || !account.isApproved) {
      redirect("/");
    }
    return account;
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      redirect("/admin/login");
    }
    throw error;
  }
};
