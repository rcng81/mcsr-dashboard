def extract_splits(match_data):
    splits = {}

    def ensure_player(uuid):
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

    def set_min_split(uuid, key, time_value):
        if time_value is None:
            return
        ensure_player(uuid)
        current = splits[uuid][key]
        if current is None or time_value < current:
            splits[uuid][key] = time_value

    data = match_data.get("data", {})
    timelines = data.get("timelines", [])
    completions = data.get("completions", [])

    for completion in completions:
        uuid = completion.get("uuid")
        completion_time = completion.get("time")
        if not uuid:
            continue
        ensure_player(uuid)
        if completion_time is not None and splits[uuid]["finish"] is None:
            # Fallback: completion time is final split even if timeline.complete is missing.
            set_min_split(uuid, "finish", completion_time)

    for event in timelines:
        uuid = event.get("uuid")
        event_type = event.get("type")
        time = event.get("time")
        if not uuid or not event_type:
            continue

        ensure_player(uuid)

        if event_type == "story.enter_the_nether":
            set_min_split(uuid, "nether_enter", time)

        elif event_type == "nether.find_bastion":
            set_min_split(uuid, "bastion", time)

        elif event_type == "nether.find_fortress":
            set_min_split(uuid, "fortress", time)

        elif event_type == "nether.obtain_blaze_rod":
            set_min_split(uuid, "first_rod", time)

        elif event_type == "projectelo.timeline.blind_travel":
            set_min_split(uuid, "blind", time)

        elif event_type == "story.follow_ender_eye":
            set_min_split(uuid, "stronghold", time)

        elif event_type == "story.enter_the_end":
            set_min_split(uuid, "end_enter", time)

        elif event_type == "projectelo.timeline.dragon_death":
            set_min_split(uuid, "dragon_death", time)

        elif event_type == "projectelo.timeline.complete":
            set_min_split(uuid, "finish", time)

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
