nxml = dofile_once("mods/component-explorer/deps/nathan_nxml.lua")

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

function check_ray_energy()
    local results = {}
    local processed_count = 0

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

        local entity = EntityLoad("data/entities/projectiles/" .. spellFile)
        if not entity or entity == 0 then
            print("Failed to load entity: " .. spellFile)
            goto continue
        end

        print("Processing " .. spellFile)
        processed_count = processed_count + 1

        -- Get components for this specific entity
        local proj_comp = EntityGetFirstComponent(entity, "ProjectileComponent")
        local celleat_comp = EntityGetFirstComponent(entity, "CellEaterComponent")
        local looseground_comp = EntityGetFirstComponent(entity, "LooseGroundComponent")
        local bh_comp = EntityGetFirstComponent(entity, "BlackHoleComponent")
        local touch_comp = EntityGetFirstComponent(entity, "MagicConvertMaterialComponent")
        local phys_comp = EntityGetFirstComponent(entity, "PhysicsBodyComponent")
        local laser_comp = EntityGetFirstComponent(entity, "LaserEmitterComponent")

        -- Prepare output string
        local output = "=== " .. spellFile .. " ===\n"

        if proj_comp then
            output = output .. "ProjectileComponent:\n"
            output = output ..
                "  ground_penetration_coeff: " ..
                tostring(ComponentGetValue2(proj_comp, "ground_penetration_coeff")) .. "\n"
            output = output ..
                "  ground_penetration_max_durability_to_destroy: " ..
                tostring(ComponentGetValue2(proj_comp, "ground_penetration_max_durability_to_destroy")) .. "\n"

            -- Check if config_explosion exists before accessing it
            local explosion_max_durability = ComponentObjectGetValue2(proj_comp, "config_explosion",
                "max_durability_to_destroy")
            local ray_energy = ComponentObjectGetValue2(proj_comp, "config_explosion", "ray_energy")

            if explosion_max_durability ~= nil then
                output = output ..
                    "  explosion_max_durability_to_destroy: " .. tostring(explosion_max_durability) .. "\n"
            end
            if ray_energy ~= nil then
                output = output .. "  ray_energy: " .. tostring(ray_energy) .. "\n"
            end

            local spawn_entity = ComponentGetValue2(proj_comp, "spawn_entity")
            local spawn_entity_is_projectile = ComponentGetValue2(proj_comp, "spawn_entity_is_projectile")

            if spawn_entity ~= nil then
                output = output .. "  spawn_entity: " .. tostring(spawn_entity) .. "\n"
            end
            if spawn_entity_is_projectile ~= nil then
                output = output ..
                    "  spawn_entity_is_projectile: " .. tostring(spawn_entity_is_projectile) .. "\n"
            end
        end

        if celleat_comp then
            output = output .. "CellEaterComponent:\n"
            local radius = ComponentGetValue2(celleat_comp, "radius")
            local limited_materials = ComponentGetValue2(celleat_comp, "limited_materials")
            local ignored_material_tag = ComponentGetValue2(celleat_comp, "ignored_material_tag")
            local materials = ComponentGetValue2(celleat_comp, "materials")

            if radius ~= nil then
                output = output .. "  radius: " .. tostring(radius) .. "\n"
            end
            if limited_materials ~= nil then
                output = output .. "  limited_materials: " .. tostring(limited_materials) .. "\n"
            end
            if ignored_material ~= nil then
                output = output .. "  ignored_material: " .. tostring(ignored_material) .. "\n"
            end
            if ignored_material_tag ~= nil then
                output = output .. "  ignored_material_tag: " .. tostring(ignored_material_tag) .. "\n"
            end
            if materials ~= nil then
                output = output .. "  materials: " .. tostring(#materials) .. "\n"
            end
        end

        if laser_comp then
            output = output .. "LaserEmitterComponent:\n"

            local beam_radius = ComponentObjectGetValue2(laser_comp, "laser", "beam_radius")
            local max_cell_durability_to_destroy = ComponentObjectGetValue2(laser_comp, "laser",
                "max_cell_durability_to_destroy")
            local damage_to_cells = ComponentObjectGetValue2(laser_comp, "laser", "damage_to_cells")

            if beam_radius ~= nil then
                output = output .. "  beam_radius: " .. tostring(beam_radius) .. "\n"
            end
            if max_cell_durability_to_destroy ~= nil then
                output = output ..
                    "  max_cell_durability_to_destroy: " .. tostring(max_cell_durability_to_destroy) .. "\n"
            end
            if damage_to_cells ~= nil then
                output = output .. "  damage_to_cells: " .. tostring(damage_to_cells) .. "\n"
            end
        end

        if looseground_comp then
            output = output .. "LooseGroundComponent:\n"
            local max_radius = ComponentGetValue2(looseground_comp, "max_radius")
            if max_radius ~= nil then
                output = output .. "  max_radius: " .. tostring(max_radius) .. "\n"
            end
        end

        if bh_comp then
            output = output .. "BlackHoleComponent:\n"
            local radius = ComponentGetValue2(bh_comp, "radius")
            if radius ~= nil then
                output = output .. "  radius: " .. tostring(radius) .. "\n"
            end
        end

        if touch_comp then
            output = output .. "MagicConvertMaterialComponent:\n"
            local radius = ComponentGetValue2(touch_comp, "radius")
            local is_circle = ComponentGetValue2(touch_comp, "is_circle")
            local from_any_material = ComponentGetValue2(touch_comp, "from_any_material")

            if radius ~= nil then
                output = output .. "  radius: " .. tostring(radius) .. "\n"
            end
            if is_circle ~= nil then
                output = output .. "  is_circle: " .. tostring(is_circle) .. "\n"
            end
            if from_any_material ~= nil then
                output = output .. "  from_any_material: " .. tostring(from_any_material) .. "\n"
            end
        end

        if phys_comp then
            output = output .. "PhysicsBodyComponent:\n"
            local radius = ComponentGetValue2(phys_comp, "radius")
            if radius ~= nil then
                output = output .. "  radius: " .. tostring(radius) .. "\n"
            end
        end

        output = output .. "\n"

        -- Print to console
        print(output)

        -- Write to file
        local f = io.open("mods/component-explorer/data/NEWRAYENERGY.txt", "a")
        if f then
            f:write(output)
            f:close()
        else
            print("Error: Could not open file for writing")
        end

        -- Store in results
        table.insert(results, {
            file = spellFile,
            data = output
        })

        -- Clean up entity
        EntityKill(entity)

        ::continue::
    end

    return results, processed_count
end

print("Starting check_ray_energy()")
local results, count = check_ray_energy()
print("Finished check_ray_energy(). Processed " .. count .. " spell files.")
