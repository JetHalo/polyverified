import type { NextApiRequest, NextApiResponse } from "next";

export function methodNotAllowed(res: NextApiResponse, allowed: string[]): void {
  res.setHeader("Allow", allowed.join(", "));
  res.status(405).json({ error: "Method Not Allowed", allowed });
}

export function badRequest(res: NextApiResponse, message: string): void {
  res.status(400).json({ error: message });
}

export function internalServerError(res: NextApiResponse, message = "Internal Server Error"): void {
  res.status(500).json({ error: message });
}

export function notFound(res: NextApiResponse, message = "Not Found"): void {
  res.status(404).json({ error: message });
}

export function getSingleQueryValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export function requireMethod(req: NextApiRequest, res: NextApiResponse, method: string): boolean {
  if (req.method !== method) {
    methodNotAllowed(res, [method]);
    return false;
  }

  return true;
}
