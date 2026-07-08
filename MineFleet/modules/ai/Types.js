/**
 * Types.js
 * 
 * Shared JSDoc Type Definitions for the Predictive, Self-Learning Human AI Upgrade.
 * These interfaces enforce strict decoupling between layers, ensuring any module
 * can be swapped out for a trained Machine Learning model in the future.
 */

/**
 * @typedef {Object} Entity
 * @property {string} name
 * @property {import('vec3').Vec3} position
 */

/**
 * @typedef {Object} PointOfInterest
 * @property {string} type
 * @property {import('vec3').Vec3} position
 */

/**
 * @typedef {Object} WorldObservation
 * @property {number} timestamp
 * @property {number} health
 * @property {number} food
 * @property {number} inventoryValue
 * @property {Entity[]} threats
 * @property {PointOfInterest[]} interestingObjects
 * @property {string[]} recentEvents
 */

/**
 * @typedef {Object} PersonalityProfile
 * @property {number} riskTolerance - 0.0 to 1.0
 * @property {number} explorationTendency - 0.0 to 1.0
 * @property {number} combatAggressiveness - 0.0 to 1.0
 * @property {number} curiosity - 0.0 to 1.0
 * @property {number} confidence - 0.0 to 1.0
 */

/**
 * @typedef {Object} TacticalGoal
 * @property {string} id
 * @property {'gather_resource' | 'secure_area' | 'retreat' | 'explore_structure' | 'idle'} type
 * @property {any} targetParams - e.g., block coordinates or resource type
 * @property {number} priority
 */

/**
 * @typedef {Object} UtilityContext
 * @property {WorldObservation} observation
 * @property {TacticalGoal} tacticalGoal
 * @property {PersonalityProfile} personality
 * @property {number} confidence
 * @property {number} recentFailures
 * @property {number} recentSuccesses
 */

/**
 * @typedef {Object} PredictionSignal
 * @property {'explosion_radius' | 'path_hazard' | 'tool_breakage' | 'mob_spawn'} type
 * @property {number} confidence - 0.0 to 1.0
 * @property {number} urgency - 0.0 to 1.0
 * @property {Record<string, number>} suggestedActionAdjustments - e.g. { flee: +50, mine: -20 }
 */

/**
 * @typedef {Object} PredictionSet
 * @property {PredictionSignal[]} signals
 */

/**
 * @typedef {Object} UtilityScoreMap
 * @property {number} mine
 * @property {number} flee
 * @property {number} fight
 * @property {number} explore
 * @property {number} return_home
 * @property {number} craft
 * @property {number} organize_inventory
 * @property {number} idle
 */

/**
 * @typedef {Object} MicroTask
 * @property {string} id
 * @property {'move_to' | 'aim_at' | 'interact_block' | 'attack_entity'} type
 * @property {import('vec3').Vec3} target
 * @property {(context: UtilityContext, predictions: PredictionSet) => boolean} checkValidity
 */

/**
 * @typedef {Object} MovementCommand
 * @property {number} mouseXDelta - radians
 * @property {number} mouseYDelta - radians
 * @property {boolean} forward
 * @property {boolean} backward
 * @property {boolean} left
 * @property {boolean} right
 * @property {boolean} sprint
 * @property {boolean} jump
 * @property {boolean} sneak
 * @property {boolean} attack
 * @property {boolean} use
 * @property {number} hotbarSlot
 */

/**
 * @typedef {Object} ExperienceRecord
 * @property {number} timestamp
 * @property {import('vec3').Vec3} location
 * @property {'death' | 'combat_success' | 'resource_found' | 'route_success'} category
 * @property {string} details - JSON payload
 * @property {string|null} lessonLearned
 */

module.exports = {};
