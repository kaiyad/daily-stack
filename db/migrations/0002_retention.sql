-- Free Postgres tiers cap out at ~0.5GB, and raw items accrue ~2.6KB each at
-- ~1000/day. They are pruned on a retention window; everything a published
-- edition needs is already a frozen copy in edition_slots.

-- A published edition must not be destroyable by housekeeping. Deleting a
-- cluster used to cascade into edition_slots, which the frozen-edition trigger
-- would then have to catch - better that the delete simply cannot happen.
alter table edition_slots
  drop constraint edition_slots_cluster_id_fkey,
  add constraint edition_slots_cluster_id_fkey
    foreign key (cluster_id) references clusters(id) on delete restrict;

create index if not exists clusters_primary_item_idx on clusters (primary_item_id);
create index if not exists edition_slots_cluster_idx on edition_slots (cluster_id);
