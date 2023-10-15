import { Router } from "express";
import fs from "fs";
import path from "path";

export default function initRoute(router: Router): void {
  router.get("/fortnite/api/calendar/v1/timeline", (req, res) => {
    let season: number = 0;
    let useragent = req.headers["user-agent"] || "";
    const currentTime = new Date().toISOString();

    if (useragent) {
      try {
        season = parseInt(useragent.split("-")[1].split(".")[0], 10) || 2;
      } catch {
        season = 2;
      }
    } else {
      season = 2;
    }

    res.status(204).json(require("../shop/timeline.json"));
  });
}
