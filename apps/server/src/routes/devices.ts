import {
  DevicePlatformSchema,
  type RelayService,
  ValidationError,
} from "@relay/core";
import { Hono } from "hono";
import { z } from "zod";
import {
  type AuthOptions,
  assertPairStartAllowed,
} from "../auth.js";
import { handleError } from "../http_errors.js";

const ClaimBodySchema = z.object({
  code: z.string().min(1).max(16),
  device_name: z.string().min(1).max(120),
  platform: DevicePlatformSchema.default("other"),
});

const RenameBodySchema = z.object({
  name: z.string().min(1).max(120),
});

export function createDeviceRoutes(
  svc: RelayService,
  auth: AuthOptions,
): Hono {
  const app = new Hono();

  app.post("/pair/start", (c) => {
    try {
      assertPairStartAllowed(c, auth);
      const device = c.get("relayDevice");
      const session = svc.startPairing({
        publicUrl: auth.publicUrl,
        createdByDeviceId: device?.id ?? null,
      });
      // Never log session.code or session.qr.
      return c.json({
        code: session.code,
        expires_at: session.expires_at,
        qr: session.qr,
      });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.post("/pair/claim", async (c) => {
    try {
      const body = ClaimBodySchema.parse(await c.req.json());
      const created = svc.claimPairing({
        code: body.code,
        device_name: body.device_name,
        platform: body.platform,
        clientIp: auth.resolveClientIp(c),
      });
      return c.json({
        device_id: created.device.id,
        token: created.token,
        device: created.device,
      });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.get("/devices", (c) => {
    try {
      return c.json({ devices: svc.listDevices() });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.patch("/devices/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const body = RenameBodySchema.parse(await c.req.json());
      const device = svc.renameDevice(id, body.name);
      return c.json({ device });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.delete("/devices/:id", (c) => {
    try {
      const id = c.req.param("id");
      const device = svc.revokeDevice(id);
      return c.json({ device });
    } catch (err) {
      return handleError(c, err);
    }
  });

  app.post("/stream/ticket", (c) => {
    try {
      const device = c.get("relayDevice");
      if (!device) {
        throw new ValidationError("Device authentication required");
      }
      const ticket = svc.mintStreamTicket(device.id);
      return c.json({
        access_token: ticket.token,
        expires_at: ticket.expires_at,
        expires_in: ticket.expires_in,
      });
    } catch (err) {
      return handleError(c, err);
    }
  });

  return app;
}
