nxml = dofile_once("mods/component-explorer/deps/nathan_nxml.lua")

-- Default values
local DEFAULT_RAY_ENERGY = 20000
local DEFAULT_MAX_DURABILITY = 10

-- Cache for base file contents to avoid re-reading
local base_file_cache = {}

tntOnly = { "tnt.xml", }

spellFiles = { "acidburst.xml",
    "acidshot_slow.xml",
    "acidshot.xml",
    "arrow.xml",
    "bat.xml",
    "bloomshot.xml",
    "bomb_cart.xml",
    "bomb_holy_giga.xml",
    "bomb_holy.xml",
    "bomb_small.xml",
    "bomb.xml",
    "bossdragon_ray.xml",
    "bossdragon.xml",
    "buckshot.xml",
    "bullet_poison.xml",
    "chaos_polymorph.xml",
    "chunk_of_soil.xml",
    "circle_acid_die.xml",
    "circle_acid_small.xml",
    "circle_blood_small.xml",
    "circle_blood.xml",
    "circle_lava_small.xml",
    "circle_lava.xml",
    "circle_water.xml",
    "clusterbomb.xml",
    "cocktail.xml",
    "coward_bullet.xml",
    "darkflame_stationary.xml",
    "darkflame.xml",
    "dotshot_strong.xml",
    "dotshot.xml",
    "dummy.xml",
    "egg_fire.xml",
    "egg_monster.xml",
    "egg_purple.xml",
    "egg_red.xml",
    "egg_slime.xml",
    "egg_worm.xml",
    "enlightened_laser_dark_wand.xml",
    "enlightened_laser_darkbeam.xml",
    "enlightened_laser_elec_wand.xml",
    "enlightened_laser_elecbeam.xml",
    "enlightened_laser_fire_wand.xml",
    "enlightened_laser_fireball.xml",
    "enlightened_laser_light_wand.xml",
    "enlightened_laser_lightbeam.xml",
    "explosion.xml",
    "fire_trap.xml",
    "fireball_bigfirebug.xml",
    "fireball_firebug.xml",
    "fireball_ghostly.xml",
    "fireball.xml",
    "flamethrower.xml",
    "freeze_circle.xml",
    "fungus_big_explosion.xml",
    "fungus_explosion.xml",
    "fungus.xml",
    "gasblob.xml",
    "glitter_bomb_explosion.xml",
    "glitter_bomb_shrapnel.xml",
    "glitter_bomb.xml",
    "glue_anchor.xml",
    "glue_shot.xml",
    "glue.xml",
    "grenade_leader.xml",
    "grenade_scavenger.xml",
    "healshot_safe_haven.xml",
    "healshot_slow.xml",
    "healshot.xml",
    "hiddenshot.xml",
    "ice.xml",
    "iceball.xml",
    "iceskull_explosion.xml",
    "icethrower.xml",
    "invisshot.xml",
    "laser_bouncy.xml",
    "laser_lasergun.xml",
    "laser_spear.xml",
    "laser_turret.xml",
    "laserbeam_green.xml",
    "laserbeam.xml",
    "lavashot.xml",
    "levitation_trail.xml",
    "lightning_thunderburst.xml",
    "lightning_thunderskull.xml",
    "lightning.xml",
    "lurkershot.xml",
    "machinegun_bullet_roboguard_big.xml",
    "machinegun_bullet_slow.xml",
    "machinegun_bullet_slower.xml",
    "machinegun_bullet_tank_super.xml",
    "machinegun_bullet_tank.xml",
    "megalaser_blue_beam.xml",
    "megalaser_blue.xml",
    "meteor_green.xml",
    "mine_explosion.xml",
    "mine_scavenger.xml",
    "mine.xml",
    "neutralizershot.xml",
    "orb_blue.xml",
    "orb_cursed.xml",
    "orb_dark.xml",
    "orb_expanding.xml",
    "orb_green_accelerating.xml",
    "orb_green_boss_dragon.xml",
    "orb_green_spin.xml",
    "orb_green.xml",
    "orb_hearty.xml",
    "orb_homing.xml",
    "orb_neutral.xml",
    "orb_pink_big_explosive.xml",
    "orb_pink_big_slow.xml",
    "orb_pink_big_super_shrapnel.xml",
    "orb_pink_big_super.xml",
    "orb_pink_big.xml",
    "orb_pink_fast.xml",
    "orb_pink_super.xml",
    "orb_pink.xml",
    "orb_poly.xml",
    "orb_purple.xml",
    "orb_swapper.xml",
    "orb_tele.xml",
    "orb_tiny.xml",
    "orb_twitchy.xml",
    "orb_weaken.xml",
    "orb_wither.xml",
    "orb.xml",
    "orbspawner_blue.xml",
    "orbspawner_green.xml",
    "orbspawner.xml",
    "pebble.xml",
    "pollen_ball.xml",
    "pollen.xml",
    "polyorb.xml",
    "polyshot.xml",
    "present.xml",
    "propane_tank.xml",
    "pusblob.xml",
    "radioactive_blob_trail.xml",
    "radioactive_blob.xml",
    "radioactive_liquid.xml",
    "rain_gold.xml",
    "remove_ground.xml",
    "rocket_crystal_pink.xml",
    "rocket_drone.xml",
    "rocket_tank.xml",
    "rocket_tiny_particles.xml",
    "rocket_tiny_roll.xml",
    "rocket_tiny.xml",
    "sentryshot.xml",
    "shieldshot_small.xml",
    "shieldshot.xml",
    "slimeblob.xml",
    "slimetrail.xml",
    "smalltentacle_melee.xml",
    "smalltentacle.xml",
    "sniperbullet_hell.xml",
    "sniperbullet.xml",
    "soldiershot.xml",
    "SPELLLISTER.ps1",
    "SPELLSLIST.txt",
    "spit_trap.xml",
    "state_1.xml",
    "summonshine.xml",
    "tentacle.xml",
    "thunder_trap.xml",
    "thunderball_line.xml",
    "thunderball_slow.xml",
    "thunderball.xml",
    "thunderburst_thundermage.xml",
    "tnt_hell.xml",
    "tnt.xml",
    "tongue.xml",
    "ultimate_killer_explosion.xml",
    "ultimate_killer_megabomb.xml",
    "wraith_glowing_laser.xml",
    "deck/acidburst.xml",
    "deck/acidshot.xml",
    "deck/alcohol_blast.xml",
    "deck/all_acid.xml",
    "deck/all_blackholes.xml",
    "deck/all_deathcrosses.xml",
    "deck/all_discs.xml",
    "deck/all_nukes.xml",
    "deck/all_rockets.xml",
    "deck/all_spells_base.xml",
    "deck/all_spells_loader_slow.xml",
    "deck/all_spells_loader.xml",
    "deck/all_spells_orb.xml",
    "deck/all_spells_part.xml",
    "deck/arrow.xml",
    "deck/ball_lightning.xml",
    "deck/base_field.xml",
    "deck/berserk_field.xml",
    "deck/big_magic_shield_part.xml",
    "deck/big_magic_shield_start.xml",
    "deck/black_hole_big.xml",
    "deck/black_hole_giga.xml",
    "deck/black_hole.xml",
    "deck/bloodtentacle.xml",
    "deck/bomb_detonator.xml",
    "deck/bounce_explosion.xml",
    "deck/bounce_hole.xml",
    "deck/bounce_laser_launcher.xml",
    "deck/bounce_laser.xml",
    "deck/bounce_lightning_launcher.xml",
    "deck/bounce_lightning.xml",
    "deck/bounce_small_explosion.xml",
    "deck/bounce_spark_friendly_fire_silent.xml",
    "deck/bounce_spark_friendly_fire.xml",
    "deck/bounce_spark_main.xml",
    "deck/bounce_spark.xml",
    "deck/bouncy_orb.xml",
    "deck/bubbleshot.xml",
    "deck/buckshot_player.xml",
    "deck/bullet_heavy.xml",
    "deck/bullet_slow.xml",
    "deck/bullet.xml",
    "deck/chain_bolt_explosion.xml",
    "deck/chain_bolt.xml",
    "deck/chainsaw.xml",
    "deck/chaos_polymorph_field.xml",
    "deck/charm_field.xml",
    "deck/circle_acid.xml",
    "deck/circle_fire.xml",
    "deck/circle_oil.xml",
    "deck/circle_water.xml",
    "deck/cloud_acid.xml",
    "deck/cloud_blood.xml",
    "deck/cloud_oil.xml",
    "deck/cloud_thunder.xml",
    "deck/cloud_water.xml",
    "deck/commander_bullet.xml",
    "deck/crumbling_earth_effect.xml",
    "deck/crumbling_earth.xml",
    "deck/death_cross_big_explosion.xml",
    "deck/death_cross_big_laser.xml",
    "deck/death_cross_big.xml",
    "deck/death_cross.xml",
    "deck/decoy_trigger.xml",
    "deck/decoy.xml",
    "deck/delayed_spell.xml",
    "deck/destruction.xml",
    "deck/digger.xml",
    "deck/disc_bullet_big.xml",
    "deck/disc_bullet_bigger.xml",
    "deck/disc_bullet.xml",
    "deck/duck.xml",
    "deck/electrocution_field.xml",
    "deck/exploding_deer.xml",
    "deck/explosion_giga.xml",
    "deck/explosion_light.xml",
    "deck/explosion.xml",
    "deck/fireball_ray_small.xml",
    "deck/fireball_ray.xml",
    "deck/fireball.xml",
    "deck/fireblast.xml",
    "deck/firebomb.xml",
    "deck/fish.xml",
    "deck/fizzle.xml",
    "deck/flamethrower.xml",
    "deck/freeze_field.xml",
    "deck/freezing_gaze_beam.xml",
    "deck/freezing_gaze.xml",
    "deck/friend_fly.xml",
    "deck/glitter_bomb_explosion.xml",
    "deck/glitter_bomb_shrapnel.xml",
    "deck/glitter_bomb.xml",
    "deck/glowing_bolt.xml",
    "deck/glue_shot.xml",
    "deck/grenade_anti.xml",
    "deck/grenade_large.xml",
    "deck/grenade_small.xml",
    "deck/grenade_tier_2.xml",
    "deck/grenade_tier_3.xml",
    "deck/grenade.xml",
    "deck/heal_bullet_weak.xml",
    "deck/heal_bullet.xml",
    "deck/healhurt.xml",
    "deck/hook.xml",
    "deck/iceball.xml",
    "deck/infestation.xml",
    "deck/keyshot.xml",
    "deck/lance_holy.xml",
    "deck/lance.xml",
    "deck/laser.xml",
    "deck/levitation_field.xml",
    "deck/light_bullet_air.xml",
    "deck/light_bullet_blue.xml",
    "deck/light_bullet.xml",
    "deck/lightning_extra_arcs.xml",
    "deck/lightning_weak.xml",
    "deck/lightning.xml",
    "deck/long_distance_cast.xml",
    "deck/luminous_drill.xml",
    "deck/machinegun_bullet.xml",
    "deck/magic_shield_part.xml",
    "deck/magic_shield_start.xml",
    "deck/mana.xml",
    "deck/mass_polymorph.xml",
    "deck/material_acid.xml",
    "deck/material_blood.xml",
    "deck/material_cement.xml",
    "deck/material_debug.xml",
    "deck/material_dirt.xml",
    "deck/material_gunpowder_explosive.xml",
    "deck/material_lava.xml",
    "deck/material_liquid.xml",
    "deck/material_oil.xml",
    "deck/material_water.xml",
    "deck/megalaser_beam.xml",
    "deck/megalaser.xml",
    "deck/meteor_green.xml",
    "deck/meteor_rain_meteor.xml",
    "deck/meteor_rain.xml",
    "deck/meteor.xml",
    "deck/mine.xml",
    "deck/mist_alcohol.xml",
    "deck/mist_blood.xml",
    "deck/mist_radioactive.xml",
    "deck/mist_slime.xml",
    "deck/nuke_giga.xml",
    "deck/nuke.xml",
    "deck/orb_laseremitter_cutter.xml",
    "deck/orb_laseremitter_four.xml",
    "deck/orb_laseremitter_weak_opposite.xml",
    "deck/orb_laseremitter_weak.xml",
    "deck/orb_laseremitter.xml",
    "deck/pata_rocket_1.xml",
    "deck/pata_rocket_2.xml",
    "deck/pata_rocket_3.xml",
    "deck/pata_rocket_4.xml",
    "deck/pata_rocket_5.xml",
    "deck/pata_rocket_6.xml",
    "deck/pebble_player_physics.xml",
    "deck/pebble_player.xml",
    "deck/pink_orb.xml",
    "deck/pipe_bomb_detonator.xml",
    "deck/pipe_bomb.xml",
    "deck/poison_blast.xml",
    "deck/pollen.xml",
    "deck/polymorph_field.xml",
    "deck/powerdigger.xml",
    "deck/projectile_gravity_field.xml",
    "deck/projectile_thunder_field.xml",
    "deck/projectile_thunder_lightning.xml",
    "deck/projectile_transmutation_field.xml",
    "deck/purple_explosion_field.xml",
    "deck/purple_explosion.xml",
    "deck/regeneration_aura.xml",
    "deck/regeneration_field_long.xml",
    "deck/regeneration_field.xml",
    "deck/rock.xml",
    "deck/rocket_downwards.xml",
    "deck/rocket_player.xml",
    "deck/rocket_tier_2.xml",
    "deck/rocket_tier_3.xml",
    "deck/rocket.xml",
    "deck/rubber_ball.xml",
    "deck/sausage.xml",
    "deck/sea_acid_gas.xml",
    "deck/sea_acid.xml",
    "deck/sea_alcohol.xml",
    "deck/sea_lava.xml",
    "deck/sea_mimic.xml",
    "deck/sea_oil.xml",
    "deck/sea_swamp.xml",
    "deck/sea_water.xml",
    "deck/shield_field.xml",
    "deck/skull.xml",
    "deck/slime.xml",
    "deck/spiral_part.xml",
    "deck/spiral_shot.xml",
    "deck/spitter_tier_2.xml",
    "deck/spitter_tier_3.xml",
    "deck/spitter.xml",
    "deck/spore_pod_growing.xml",
    "deck/spore_pod_spike.xml",
    "deck/spore_pod.xml",
    "deck/summon_portal_teleport.xml",
    "deck/summon_portal.xml",
    "deck/super_teleport_cast.xml",
    "deck/swapper.xml",
    "deck/swarm_firebug.xml",
    "deck/swarm_fly.xml",
    "deck/swarm_wasp.xml",
    "deck/telepathy_field.xml",
    "deck/teleport_cast.xml",
    "deck/teleport_projectile_closer.xml",
    "deck/teleport_projectile_short.xml",
    "deck/teleport_projectile_static.xml",
    "deck/teleport_projectile.xml",
    "deck/teleportation_field.xml",
    "deck/temporary_platform.xml",
    "deck/temporary_wall.xml",
    "deck/tentacle_portal.xml",
    "deck/tentacle.xml",
    "deck/thunder_blast.xml",
    "deck/tnt.xml",
    "deck/tntbox_big.xml",
    "deck/tntbox.xml",
    "deck/touch_alcohol.xml",
    "deck/touch_blood.xml",
    "deck/touch_gold.xml",
    "deck/touch_grass.xml",
    "deck/touch_oil.xml",
    "deck/touch_piss.xml",
    "deck/touch_smoke.xml",
    "deck/touch_water.xml",
    "deck/vacuum_entities.xml",
    "deck/vacuum_liquid.xml",
    "deck/vacuum_powder.xml",
    "deck/wall_builder.xml",
    "deck/wall_horizontal.xml",
    "deck/wall_piece.xml",
    "deck/wall_sound.xml",
    "deck/wall_square.xml",
    "deck/wall_vertical.xml",
    "deck/wand_ghost_player.xml",
    "deck/water.xml",
    "deck/white_hole_big.xml",
    "deck/white_hole_giga.xml",
    "deck/white_hole.xml",
    "deck/worm_rain.xml",
    "deck/worm_shot.xml",
    "deck/xray_effect.xml",
    "deck/xray.xml",
    "deck/fireworks/firework_blue.xml",
    "deck/fireworks/firework_green.xml",
    "deck/fireworks/firework_orange.xml",
    "deck/fireworks/firework_pink.xml",
    "deck/kantele/kantele_a.xml",
    "deck/kantele/kantele_d.xml",
    "deck/kantele/kantele_dis.xml",
    "deck/kantele/kantele_e.xml",
    "deck/kantele/kantele_g.xml",
    "deck/ocarina/ocarina_a.xml",
    "deck/ocarina/ocarina_a2.xml",
    "deck/ocarina/ocarina_b.xml",
    "deck/ocarina/ocarina_c.xml",
    "deck/ocarina/ocarina_d.xml",
    "deck/ocarina/ocarina_e.xml",
    "deck/ocarina/ocarina_f.xml",
    "deck/ocarina/ocarina_gsharp.xml",
    "tentacle/bloodtentacle_0.xml",
    "tentacle/bloodtentacle_1.xml",
    "tentacle/bloodtentacle_2.xml",
    "tentacle/bloodtentacle_3.xml",
    "tentacle/bloodtentacle_4.xml",
    "tentacle/smalltentacle_0.xml",
    "tentacle/smalltentacle_1.xml",
    "tentacle/smalltentacle_1b.xml",
    "tentacle/smalltentacle_2.xml",
    "tentacle/smalltentacle_3.xml",
    "tentacle/smalltentacle_4.xml",
    "tentacle/tentacle_0.xml",
    "tentacle/tentacle_1.xml",
    "tentacle/tentacle_1b.xml",
    "tentacle/tentacle_2.xml",
    "tentacle/tentacle_2b.xml",
    "tentacle/tentacle_3.xml",
    "tentacle/tentacle_3b.xml",
    "tentacle/tentacle_4.xml",
    "tentacle/tongue_0.xml",
    "tentacle/tongue_1.xml",
    "tentacle/tongue_2.xml",
    "tentacle/tongue_3.xml",
    "tentacle/tongue_4.xml" }

-- Function to get base file content with caching
function get_base_file_content(base_file_path)
    if base_file_cache[base_file_path] then
        return base_file_cache[base_file_path]
    end

    local content = ModTextFileGetContent(base_file_path)
    base_file_cache[base_file_path] = content
    return content
end

-- Function to extract values from content with inheritance chain
function extract_explosion_values(content, visited_files)
    visited_files = visited_files or {}

    if not content then
        return nil, nil, nil
    end

    -- Extract current file values
    local ray_energy = content:match('<config_explosion[^>]*ray_energy="([^"]*)"')
    local max_durability = content:match('<config_explosion[^>]*max_durability_to_destroy="([^"]*)"')
    local base_file = content:match('<Base[^>]*file="([^"]*)"')

    -- Convert string values to numbers if found
    if ray_energy then
        ray_energy = tonumber(ray_energy)
    end
    if max_durability then
        max_durability = tonumber(max_durability)
    end

    -- If we have both values, return them
    if ray_energy and max_durability then
        return ray_energy, max_durability, base_file
    end

    -- If we have a base file and haven't visited it yet, check inheritance
    if base_file and not visited_files[base_file] then
        visited_files[base_file] = true
        local base_content = get_base_file_content(base_file)
        if base_content then
            local base_ray_energy, base_max_durability, _ = extract_explosion_values(base_content, visited_files)

            -- Use inherited values if current file doesn't have them
            ray_energy = ray_energy or base_ray_energy
            max_durability = max_durability or base_max_durability
        end
    end

    return ray_energy, max_durability, base_file
end

-- Function to generate correct spell name
function generate_spell_name(spellFile)
    local name = spellFile:gsub("%.xml$", ""):upper()

    -- Handle special cases for subdirectories
    if name:match("^DECK/") then
        -- Remove DECK/ prefix and handle nested paths
        name = name:gsub("^DECK/", "")

        -- For kantele and ocarina, only keep the last part
        if name:match("^KANTELE/") then
            name = name:gsub("^KANTELE/", "")
        elseif name:match("^OCARINA/") then
            name = name:gsub("^OCARINA/", "")
        elseif name:match("^FIREWORKS/") then
            name = name:gsub("^FIREWORKS/", "")
        end
    elseif name:match("^TENTACLE/") then
        -- For tentacle files, keep the full name but replace / with _
        name = name:gsub("/", "_")
    end

    return name
end

function check_ray_energy()
    local results = {}

    -- Clear the output file
    local f = io.open("mods/component-explorer/data/NEWRAYENERGY.txt", "w")
    if f then
        f:close()
    end

    for _, spellFile in ipairs(spellFiles) do
        -- Skip non-XML files
        if not spellFile:match("%.xml$") then
            goto continue
        end

        local content = ModTextFileGetContent("data/entities/projectiles/" .. spellFile)
        if content then
            print("Processing " .. spellFile)

            local ray_energy, max_durability, base_file = extract_explosion_values(content)

            -- Apply defaults if values not found
            ray_energy = ray_energy or DEFAULT_RAY_ENERGY
            max_durability = max_durability or DEFAULT_MAX_DURABILITY

            -- Generate proper spell name
            local spell_name = generate_spell_name(spellFile)

            -- Store result
            local result = {
                name = spell_name,
                file = spellFile,
                ray_energy = ray_energy,
                max_durability_to_destroy = max_durability,
                base_file = base_file
            }
            table.insert(results, result)

            -- Write to file
            local f = io.open("mods/component-explorer/data/NEWRAYENERGY.txt", "a")
            if f then
                f:write(string.format("%s: ray_energy=%d, max_durability_to_destroy=%d",
                    spell_name, ray_energy, max_durability))
                if base_file then
                    f:write(", base_file=" .. base_file)
                end
                f:write(" (from " .. spellFile .. ")\n")
                f:close()
            end

            print(string.format("  %s: ray_energy=%d, max_durability=%d",
                spell_name, ray_energy, max_durability))
        else
            print("Could not read " .. spellFile)
        end

        ::continue::
    end

    -- Generate JSON output
    local json_output = "[\n"
    for i, result in ipairs(results) do
        json_output = json_output ..
            string.format('  {\n    "name": "%s",\n    "ray_energy": %d,\n    "max_durability_to_destroy": %d\n  }',
                result.name, result.ray_energy, result.max_durability_to_destroy)
        if i < #results then
            json_output = json_output .. ","
        end
        json_output = json_output .. "\n"
    end
    json_output = json_output .. "]"

    -- Write JSON file
    local json_file = io.open("mods/component-explorer/data/EXPLOSION_DATA.json", "w")
    if json_file then
        json_file:write(json_output)
        json_file:close()
        print("JSON data written to EXPLOSION_DATA.json")
    end

    return results
end

print("Starting check_ray_energy()")
local results = check_ray_energy()
print("Finished check_ray_energy(). Processed " .. #results .. " spell files.")
