-- Add RPG-specific objective types that were missing from the initial schema.
-- These are used by the campaign generator for switch puzzles, door mechanics,
-- and quest-chain progression objectives.

ALTER TYPE "band_rpg_objective_type" ADD VALUE IF NOT EXISTS 'activate_switch';
ALTER TYPE "band_rpg_objective_type" ADD VALUE IF NOT EXISTS 'open_door';
ALTER TYPE "band_rpg_objective_type" ADD VALUE IF NOT EXISTS 'complete_quest';
