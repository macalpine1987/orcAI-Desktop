import { beforeEach, describe, expect, it } from "vitest";
import {
  dismissClearedActiveProjectNotice,
  peekClearedActiveProjectNotice,
  publishClearedActiveProjectNotice,
} from "./clearedActiveProjectNotice";

describe("clearedActiveProjectNotice", () => {
  beforeEach(() => {
    localStorage.clear();
    try {
      sessionStorage.clear();
    } catch {
      /* node unit env may lack sessionStorage */
    }
    dismissClearedActiveProjectNotice();
  });

  it("persists in localStorage until dismiss", () => {
    publishClearedActiveProjectNotice({
      path: "/Volumes/USB/Fjord",
      name: "Fjord",
    });
    expect(peekClearedActiveProjectNotice()).toEqual({
      path: "/Volumes/USB/Fjord",
      name: "Fjord",
    });
    expect(
      JSON.parse(localStorage.getItem("orcai-desktop.cleared-active-project")!),
    ).toEqual({ path: "/Volumes/USB/Fjord", name: "Fjord" });

    dismissClearedActiveProjectNotice();
    expect(peekClearedActiveProjectNotice()).toBeNull();
    expect(localStorage.getItem("orcai-desktop.cleared-active-project")).toBeNull();
  });
});
