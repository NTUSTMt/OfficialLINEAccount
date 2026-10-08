import { assertEquals } from "std/assert/mod.ts";
import { validateSignature } from "./lineClient.ts";

Deno.test("lineClient: validateSignature verifies correct signature", async () => {
  const secret = "test_secret_key";
  const body = JSON.stringify({ test: "hello" });

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const validSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

  const isValid = await validateSignature(body, validSignature, secret);
  assertEquals(isValid, true);
});

Deno.test("lineClient: validateSignature rejects tampered body", async () => {
  const secret = "test_secret_key";
  const body = JSON.stringify({ test: "hello" });
  const tamperedBody = JSON.stringify({ test: "tampered" });

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const validSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

  const isValid = await validateSignature(tamperedBody, validSignature, secret);
  assertEquals(isValid, false);
});
