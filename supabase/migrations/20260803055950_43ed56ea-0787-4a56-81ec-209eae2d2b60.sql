WITH s AS (
  SELECT id,
    replace(
      replace(
        replace(
          replace(content,
            '![Number 16 - placenta specimen with membranes doubled back](https://cdn.ompathstudy.com/uploads/2026/08/y1-anatomy-embryology-slide-review-n16-5a872d3c.jpg)',
            '![Number 16 - placenta specimen with the fetal membranes doubled back at the margin](https://cdn.ompathstudy.com/uploads/2026/08/y1-anatomy-embryology-slide-review-n18-b629eea4.jpg)'),
          '![Number 18 - four sets of conjoined twins](https://cdn.ompathstudy.com/uploads/2026/08/y1-anatomy-embryology-slide-review-n18-b629eea4.jpg)',
          '![Number 18 - four sets of conjoined twins](https://cdn.ompathstudy.com/uploads/2026/08/y1-anatomy-embryology-slide-review-n20-1cde1df8.jpg)'),
        E'- Thoracopagus\n\n## Number 19',
        E'- Thoracopagus\n- Mechanism — incomplete separation of the embryonic disc of a single monozygotic (monochorionic, monoamniotic) conception\n- Named by the site of union — thoracopagus, omphalopagus, craniopagus, pygopagus, ischiopagus\n\n## Number 19'),
      E'## Number 20: Identify the anomaly in these newborn photographs\n![Number 20 - newborn photographs of conjoined twins](https://cdn.ompathstudy.com/uploads/2026/08/y1-anatomy-embryology-slide-review-n20-1cde1df8.jpg)\n\n**Answer:**\n- Conjoined twins\n- Mechanism — incomplete separation of the embryonic disc of a single monozygotic (monochorionic, monoamniotic) conception\n- Named by the site of union — thoracopagus, omphalopagus, craniopagus, pygopagus, ischiopagus\n\n',
      '') AS content
  FROM public.articles WHERE slug = 'embryology-slide-review-marathon'
)
UPDATE public.articles a SET content = s.content, updated_at = now()
FROM s WHERE a.id = s.id;