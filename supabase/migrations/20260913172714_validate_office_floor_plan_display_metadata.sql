alter table public.office_floor_plan_placements
add constraint office_floor_plan_placements_display_metadata_shape check (
  case when display_metadata ? 'rotation' then
    case when jsonb_typeof(display_metadata -> 'rotation') = 'number'
      then (display_metadata ->> 'rotation')::numeric in (0, 90, 180, 270)
      else false
    end
  else true end
  and (display_metadata ? 'width') = (display_metadata ? 'height')
  and case when display_metadata ? 'width' then
    case when jsonb_typeof(display_metadata -> 'width') = 'number'
      and jsonb_typeof(display_metadata -> 'height') = 'number'
      then (display_metadata ->> 'width')::numeric between 6 and 120
        and (display_metadata ->> 'height')::numeric between 6 and 120
      else false
    end
  else true end
);
