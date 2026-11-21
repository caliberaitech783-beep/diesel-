import { recordsPage } from './records-page.mjs';
import { masterDefinition, MasterRecordError } from './records-fields.mjs';
import { itemDirectoryPath } from './item-directory.mjs';

export function registerItemDirectoryRoutes(app, { directory, getActor, startSignIn }) {
  const route = handler => async (req,res,next) => {
    try {
      const actor = await getActor(req);
      if (!actor) {
        if (req.path===itemDirectoryPath+'/records') return startSignIn(res);
        return res.status(401).json({error:'Sign in to Diesel.'});
      }
      res.set('Cache-Control','no-store');
      await handler(req,res,actor);
    } catch(error) {
      if (error instanceof MasterRecordError) return res.status(error.status).json({error:error.message});
      next(error);
    }
  };
  app.get(itemDirectoryPath+'/records',route(async (req,res,actor)=>{
    const detail = await directory.read(actor,req.query.id,req.query.revision);
    res.set('Content-Security-Policy',"default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' blob:; frame-src 'self'; frame-ancestors 'self'; form-action 'self'; base-uri 'none'");
    res.type('html').send(recordsPage({prefix:itemDirectoryPath,master:masterDefinition('item-master'),actor,
      ...detail,rows:[],editingAllowed:false,approvingAllowed:false,masterSelected:true,dialog:req.query.dialog==='1'}));
  }));
  app.get(itemDirectoryPath+'/api/masters/item-master/records/:id/attachments/:fileId',route(async(req,res,actor)=>{
    const detail = await directory.read(actor,req.params.id);
    const file = await detail.attachment(req.params.fileId);
    res.attachment(file.name).type('application/octet-stream').set('X-Content-Type-Options','nosniff').send(Buffer.from(file.bytes));
  }));
}
