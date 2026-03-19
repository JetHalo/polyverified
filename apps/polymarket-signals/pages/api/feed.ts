import type { NextApiRequest, NextApiResponse } from "next";

import { getFeedView } from "@/server/read-models/feed";
import { requireMethod } from "@/server/http/api";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, "GET")) {
    return;
  }

  res.status(200).json(await getFeedView());
}
