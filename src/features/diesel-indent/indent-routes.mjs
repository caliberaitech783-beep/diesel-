import { randomUUID } from 'node:crypto';
import express from 'express';
import { indentPage, indentList } from './indent-page.mjs';
import { validateDraft } from './indent-rules.mjs';
import { createIndentStore, indentContext } from './indent-store.mjs';

export function registerIndents(app, db) {
  const drafts = createIndentStore(db);
  const path = '/entries/indents';
  app.get(path, (req, res) => res.send(indentList(req.dieselActor, drafts.list(req.dieselActor.site))));
  app.get(path + '/new', (req, res) => {
    const actor = req.dieselActor;
    if (!actor.canEditMasters) return res.sendStatus(403);
    res.send(indentPage(actor, { id: randomUUID(), revision: 0 }, indentContext(db, actor.site)));
  });
  app.get(path + '/:id', (req, res) => {
    const actor = req.dieselActor;
    const draft = drafts.get(actor.site, req.params.id);
    if (!draft) return res.sendStatus(404);
    res.send(indentPage(actor, draft, indentContext(db, actor.site)));
  });
  app.post(path + '/:id', express.urlencoded({ extended: false, limit: '16kb' }), (req, res) => {
    const actor = req.dieselActor;
    if (!actor.canEditMasters) return res.sendStatus(403);
    const id = req.params.id;
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) return res.sendStatus(404);
    const input = req.body ?? {};
    const revision = Number(input.revision);
    if (!/^\d+$/.test(input.revision) || !Number.isSafeInteger(revision)) return res.sendStatus(400);
    if (revision && !drafts.get(actor.site, id)) return res.sendStatus(404);
    const message = validateDraft(input);
    if (message) return res.status(422).send(indentPage(actor, { ...input, id, revision }, indentContext(db, actor.site), message));
    if (!drafts.save(id, revision, actor, input)) return res.status(409).send('This draft has changed. Reopen it from the indent list before saving.');
    res.redirect(303, path + '/' + id);
  });
}
