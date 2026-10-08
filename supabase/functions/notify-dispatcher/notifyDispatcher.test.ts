import { assertEquals } from "std/assert/mod.ts";

Deno.test("notifyDispatcher: star rating clamp works correctly", () => {
  function clampRating(val: any): { diff: number; beauty: number; diffStars: string; beautyStars: string } {
    const diff = Math.min(5, Math.max(1, parseInt(val.difficulty, 10) || 3));
    const beauty = Math.min(5, Math.max(1, parseInt(val.beauty, 10) || 5));
    return {
      diff,
      beauty,
      diffStars: "★".repeat(diff),
      beautyStars: "★".repeat(beauty),
    };
  }

  const normal = clampRating({ difficulty: 4, beauty: 5 });
  assertEquals(normal.diff, 4);
  assertEquals(normal.diffStars, "★★★★");
  assertEquals(normal.beauty, 5);
  assertEquals(normal.beautyStars, "★★★★★");

  const overflow = clampRating({ difficulty: 10, beauty: -2 });
  assertEquals(overflow.diff, 5);
  assertEquals(overflow.diffStars, "★★★★★");
  assertEquals(overflow.beauty, 1);
  assertEquals(overflow.beautyStars, "★");
});

Deno.test("notifyDispatcher: rental purpose identity mapping", () => {
  function getIdentityDesc(purpose: string, isOfficial: boolean): string {
    return purpose === "社團出隊" ? "社團出隊 (免租金)" : isOfficial ? "社員 (享5折)" : "非社員 (原價)";
  }

  assertEquals(getIdentityDesc("社團出隊", false), "社團出隊 (免租金)");
  assertEquals(getIdentityDesc("社團出隊", true), "社團出隊 (免租金)");
  assertEquals(getIdentityDesc("個人出隊", true), "社員 (享5折)");
  assertEquals(getIdentityDesc("個人出隊", false), "非社員 (原價)");
});
