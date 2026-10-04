import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { parse } from '../../lib/validate.js';
import { maps } from '../../providers/maps.js';
import { checkServiceability } from './location.service.js';

/** Map calls go through the server so the Maps API key never ships inside the app. */
export const locationRouter = Router();
locationRouter.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false }));

locationRouter.get('/serviceability', async (req, res) => {
  const { pincode } = parse(z.object({ pincode: z.string().trim() }), req.query);
  res.json(await checkServiceability(pincode));
});

locationRouter.get('/reverse-geocode', async (req, res) => {
  const { lat, lng } = parse(z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }), req.query);
  const a = await maps.reverseGeocode(lat, lng);
  if (!a) return res.json({ address: null, serviceability: null });
  res.json({ address: a, serviceability: a.pincode ? await checkServiceability(a.pincode) : null });
});

locationRouter.get('/autocomplete', async (req, res) => {
  const q = parse(z.object({ q: z.string().trim().min(2).max(120), lat: z.coerce.number().optional(), lng: z.coerce.number().optional() }), req.query);
  res.json(await maps.autocomplete(q.q, q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : undefined));
});

locationRouter.get('/place', async (req, res) => {
  const { placeId } = parse(z.object({ placeId: z.string().min(1).max(300) }), req.query);
  const a = await maps.placeDetails(placeId);
  res.json({ address: a, serviceability: a?.pincode ? await checkServiceability(a.pincode) : null });
});
