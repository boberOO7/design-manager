insert into studios (id, name) values ('00000000-0000-0000-0000-000000000001', 'ZIKZAK Architects') on conflict (id) do update set name = excluded.name;
