import test from 'node:test';
import assert from 'node:assert/strict';
import { MERCHANT_CHAIRS } from '../data/merchantCatalog';
import {
  ensureParsedConstraints,
  ensureSpatialConflictFallback,
  evaluateDeterministicConstraints,
  groundAlternativesInCatalog,
  mergeDeterministicAndModelConflicts,
  parseMeasurementsFromText,
} from './contextFitLogic';

const soren = MERCHANT_CHAIRS[0]; // H 106, W 82, $890
const alva = MERCHANT_CHAIRS[1]; // H 72, W 74, $760
const kors = MERCHANT_CHAIRS[2]; // H 102, W 64, $820
const mira = MERCHANT_CHAIRS[3]; // H 71, W 69, $640

test('evaluateDeterministicConstraints flags budget, window sill, and width violations with exact math', () => {
  const res = evaluateDeterministicConstraints(soren, {
    maxBudgetUsd: 750,
    windowSillHeightCm: 62,
    availableWidthCm: 75,
  });

  assert.equal(res.conflicts.length, 3);
  assert.equal(res.conflicts[0].status, 'confirmed_conflict');
  assert.match(res.conflicts[0].claim, /\$140/);
  assert.match(res.conflicts[1].claim, /44 cm above your 62 cm window sill/);
  assert.match(res.conflicts[2].claim, /by 7 cm/);
});

test('evaluateDeterministicConstraints passes when chair satisfies verified measurements', () => {
  const res = evaluateDeterministicConstraints(mira, {
    maxBudgetUsd: 700,
    windowSillHeightCm: 75,
    availableWidthCm: 90,
  });

  assert.equal(res.conflicts.length, 0);
  assert.ok(res.confirmedFacts.some((f) => f.includes('Budget check passed')));
  assert.ok(res.confirmedFacts.some((f) => f.includes('Window sill clearance confirmed')));
  assert.ok(res.confirmedFacts.some((f) => f.includes('21 cm horizontal margin')));
});

test('groundAlternativesInCatalog removes hallucinated IDs, excludes current chair, and enforces budget', () => {
  const grounded = groundAlternativesInCatalog(
    [
      {
        productId: 'hallucinated-chair-999',
        headline: 'Fake',
        reason: 'Fake',
        gained: 'Fake',
        tradeoff: 'Fake',
      },
      {
        productId: soren.id,
        headline: 'Duplicate current',
        reason: 'Dup',
        gained: 'Dup',
        tradeoff: 'Dup',
      },
      {
        productId: kors.id,
        headline: 'Slim high-back',
        reason: 'Open frame',
        gained: 'Keeps high back',
        tradeoff: 'Less plush',
      },
      {
        productId: alva.id,
        headline: 'Low back',
        reason: 'Clears sill',
        gained: 'Open window view',
        tradeoff: 'No headrest',
      },
    ],
    soren.id,
    MERCHANT_CHAIRS,
    { maxBudgetUsd: 650 }
  );

  // Under $650, both kors ($820) and alva ($760) are filtered out and replaced deterministically by mira ($640) and velo ($590)
  assert.equal(grounded.length, 2);
  assert.ok(grounded.every((g) => g.productId === 'forma-mira-swivel' || g.productId === 'forma-velo-cane'));
});

test('parseMeasurementsFromText extracts budget and cm hints cleanly', () => {
  const parsed = parseMeasurementsFromText(
    'Keep it under $650. The window sill is 62 cm and wall width is 95 cm.'
  );
  assert.deepEqual(parsed, {
    maxBudgetUsd: 650,
    windowSillHeightCm: 62,
    availableWidthCm: 95,
  });
});

test('mergeDeterministicAndModelConflicts deduplicates overlapping window conflicts', () => {
  const det = evaluateDeterministicConstraints(soren, { windowSillHeightCm: 60 }).conflicts;
  const merged = mergeDeterministicAndModelConflicts(det, [
    {
      title: 'Possible window obstruction',
      claim: 'May block window',
      productFact: '106 cm tall',
      status: 'unverified_spatial_inference',
      missingData: ['sill height'],
    },
    {
      title: 'Circulation around credenza',
      claim: 'Depth of 85 cm may feel tight next to the credenza.',
      productFact: 'Depth 85 cm',
      status: 'unverified_spatial_inference',
      missingData: ['wall-to-credenza distance'],
    },
  ]);

  assert.equal(merged.length, 2);
  assert.equal(merged[0].status, 'confirmed_conflict');
  assert.equal(merged[1].title, 'Circulation around credenza');
});

test('ensureSpatialConflictFallback flags unverified spatial conflict for high-back chair near window when LLM returned empty array', () => {
  const result = ensureSpatialConflictFallback(
    [],
    soren,
    "I want a reading chair here, but I don't want to block the window.",
    {}
  );

  assert.ok(result.length >= 1);
  assert.equal(result[0].status, 'unverified_spatial_inference');
  assert.match(result[0].claim, /106 cm/);
  assert.ok(result[0].missingData.some((m) => m.toLowerCase().includes('window sill')));
});

test('ensureSpatialConflictFallback does not invent false window conflict for verified-safe low-back chair', () => {
  const result = ensureSpatialConflictFallback(
    [],
    mira,
    "I want a reading chair here, but I don't want to block the window.",
    { windowSillHeightCm: 80, availableWidthCm: 100 }
  );

  assert.equal(result.length, 0);
});

test('ensureParsedConstraints extracts structured constraints when model omits them', () => {
  const result = ensureParsedConstraints(
    [],
    "I want a reading chair here, but I don't want to block the window.",
    { maxBudgetUsd: 750 }
  );

  assert.ok(result.length >= 2);
  assert.ok(result.some((c) => c.type === 'spatial' && c.priority === 'high'));
  assert.ok(result.some((c) => c.type === 'hard' && c.detail.includes('$750')));
});
