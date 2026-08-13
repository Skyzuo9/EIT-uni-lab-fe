import {
  ConnectionHandler,
  RpcConnectionHandler
} from '@theia/core/lib/common'
import { BackendApplicationContribution } from '@theia/core/lib/node'
import { ContainerModule } from '@theia/core/shared/inversify'

import {
  WORKBENCH_SESSION_PATH,
  WorkbenchSessionClient,
  WorkbenchSessionServer
} from '../common/workbench-session-protocol'
import { WorkbenchSessionService } from './workbench-session-service'

export default new ContainerModule(bind => {
  bind(WorkbenchSessionService).toSelf().inSingletonScope()
  bind(WorkbenchSessionServer).toService(WorkbenchSessionService)
  bind(BackendApplicationContribution).toService(WorkbenchSessionService)
  bind(ConnectionHandler).toDynamicValue(context => new RpcConnectionHandler<WorkbenchSessionClient>(
    WORKBENCH_SESSION_PATH,
    client => {
      const server = context.container.get<WorkbenchSessionServer>(
        WorkbenchSessionServer
      )
      server.setClient(client)
      return server
    }
  )).inSingletonScope()
})
