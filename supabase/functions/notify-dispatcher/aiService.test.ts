import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { sanitizeApplicants } from "./aiService.ts";

Deno.test("sanitizeApplicants: 應徹底過濾敏感個資只保留去識別化資訊", () => {
  const dirtyApplicants = [
    {
      anonymousId: "A1",
      name: "王小明",
      phone: "0912345678",
      email: "ming@example.com",
      student_id: "B11000001",
      id_card: "A123456789",
      line_id: "ming123",
      emergency_contact_name: "王大明",
      emergency_contact_phone: "0987654321",
      outdoor_experience: "登過玉山主峰與雪山東峰",
      fitness_desc: "每週重訓兩次",
      medical_history: "無重大病史",
    },
    {
      name: "李小華",
      outdoor_experience: "郊山健行",
      fitness_desc: "每週慢跑 5km",
    },
  ];

  const cleaned = sanitizeApplicants(dirtyApplicants);

  assertEquals(cleaned.length, 2);
  // 第一位：保留 A1 與體能經驗，無個資
  assertEquals(cleaned[0].anonymousId, "A1");
  assertEquals(cleaned[0].outdoor_experience, "登過玉山主峰與雪山東峰");
  assertEquals(cleaned[0].fitness_desc, "每週重訓兩次");
  assertEquals(cleaned[0].medical_history, "無重大病史");
  assertEquals((cleaned[0] as any).name, undefined);
  assertEquals((cleaned[0] as any).phone, undefined);
  assertEquals((cleaned[0] as any).email, undefined);
  assertEquals((cleaned[0] as any).student_id, undefined);
  assertEquals((cleaned[0] as any).id_card, undefined);
  assertEquals((cleaned[0] as any).line_id, undefined);
  assertEquals((cleaned[0] as any).emergency_contact_name, undefined);

  // 第二位：無 anonymousId 時自動補上 A2
  assertEquals(cleaned[1].anonymousId, "A2");
  assertEquals(cleaned[1].outdoor_experience, "郊山健行");
  assertEquals((cleaned[1] as any).name, undefined);
});

Deno.test("sanitizeApplicants: 空陣列或非陣列應回傳空陣列", () => {
  assertEquals(sanitizeApplicants([]), []);
  assertEquals(sanitizeApplicants(null as any), []);
});
