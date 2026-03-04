def extract_splits(match_data):
    splits = {}

    data = match_data.get("data", {})
    timelines = data.get("timelines", [])
    completions = data.get("completions", [])

    for completion in completions:
        uuid = completion.get("uuid")
        completion_time = completion.get("time")
        if not uuid:
            continue
        if uuid not in splits:
            splits[uuid] = {
                "nether_enter": None,
                "bastion": None,
                "fortress": None,
                "first_rod": None,
                "blind": None,
                "stronghold": None,
                "end_enter": None,
                "dragon_death": None,
                "finish": None
            }
        if completion_time is not None and splits[uuid]["finish"] is None:
            # Fallback: completion time is final split even if timeline.complete is missing.
            splits[uuid]["finish"] = completion_time

    for event in timelines:
        uuid = event.get("uuid")
        event_type = event.get("type")
        time = event.get("time")
        if not uuid or not event_type:
            continue

        if uuid not in splits:
            splits[uuid] = {
                "nether_enter": None,
                "bastion": None,
                "fortress": None,
                "first_rod": None,
                "blind": None,
                "stronghold": None,
                "end_enter": None,
                "dragon_death": None,
                "finish": None
            }

        if event_type == "story.enter_the_nether" and splits[uuid]["nether_enter"] is None:
            splits[uuid]["nether_enter"] = time

        elif event_type == "nether.find_bastion" and splits[uuid]["bastion"] is None:
            splits[uuid]["bastion"] = time

        elif event_type == "nether.find_fortress" and splits[uuid]["fortress"] is None:
            splits[uuid]["fortress"] = time

        elif event_type == "nether.obtain_blaze_rod" and splits[uuid]["first_rod"] is None:
            splits[uuid]["first_rod"] = time

        elif event_type == "projectelo.timeline.blind_travel" and splits[uuid]["blind"] is None:
            splits[uuid]["blind"] = time

        elif event_type == "story.follow_ender_eye" and splits[uuid]["stronghold"] is None:
            splits[uuid]["stronghold"] = time

        elif event_type == "story.enter_the_end" and splits[uuid]["end_enter"] is None:
            splits[uuid]["end_enter"] = time

        elif event_type == "projectelo.timeline.dragon_death" and splits[uuid]["dragon_death"] is None:
            splits[uuid]["dragon_death"] = time

        elif event_type == "projectelo.timeline.complete" and splits[uuid]["finish"] is None:
            splits[uuid]["finish"] = time

    return splits


def extract_death_counts(match_data):
    death_counts = {}
    timelines = match_data.get("data", {}).get("timelines", [])

    for event in timelines:
        uuid = event.get("uuid")
        event_type = event.get("type")

        if not uuid or not event_type:
            continue

        # Count all death timeline events; exclude dragon_death (boss kill milestone).
        if event_type.startswith("projectelo.timeline.death") and event_type != "projectelo.timeline.dragon_death":
            death_counts[uuid] = death_counts.get(uuid, 0) + 1

    return death_counts
