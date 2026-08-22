export interface WorkflowTemplate {
  id: string;
  title: string;
  icon: string;
  description: string;
  category: 'Integration' | 'Resilience' | 'Parallel' | 'Automation';
  tags: string[];
  specification: string;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'api-webhook-router',
    title: 'API Webhook & Decision Router',
    icon: '🔀',
    description:
      'Validate incoming webhook payload, call verification service, branch on approval status, and emit event.',
    category: 'Integration',
    tags: ['call', 'switch', 'emit', 'set'],
    specification: `document:
  dsl: "1.0.3"
  namespace: templates
  name: api-webhook-router
  version: "1.0.0"
  metadata:
    category: integration
    pattern: router
do:
  - extractPayload:
      set:
        requestId: "\${ $input.requestId }"
        status: "\${ $input.status }"
        amount: "\${ $input.amount }"
      then: verifyWithService
  - verifyWithService:
      call: verification-service
      with:
        method: post
        endpoint: https://api.example.com/v1/verify
        body:
          requestId: "\${ $context.requestId }"
      then: routeDecision
  - routeDecision:
      switch:
        - approveCase:
            when: "\${ $context.amount <= 5000 }"
            then: emitApproved
        - reviewCase:
            when: "\${ $context.amount > 5000 }"
            then: emitReviewRequired
  - emitApproved:
      emit:
        event:
          with:
            type: com.example.payment.approved
            source: https://api.example.com/events
  - emitReviewRequired:
      emit:
        event:
          with:
            type: com.example.payment.review
            source: https://api.example.com/events
`,
  },
  {
    id: 'resilient-try-catch-retry',
    title: 'Resilient Retry & Error Recovery',
    icon: '🛡️',
    description:
      'Execute critical payment task inside a try block with automated retry policies and fallback compensation.',
    category: 'Resilience',
    tags: ['try', 'catch', 'retry', 'call'],
    specification: `document:
  dsl: "1.0.3"
  namespace: templates
  name: resilient-try-catch-retry
  version: "1.0.0"
  metadata:
    category: resilience
    pattern: retry-fallback
do:
  - initializeTransaction:
      set:
        transactionId: "\${ $input.transactionId }"
        status: initialized
      then: processWithRetry
  - processWithRetry:
      try:
        - executePayment:
            call: payment-gateway
            with:
              method: post
              endpoint: https://payments.example.com/v1/charge
              body:
                txId: "\${ $context.transactionId }"
      catch:
        errors:
          with:
            type: https://example.com/errors/gateway-timeout
        retry:
          delay: PT2S
          limit:
            attempt:
              count: 3
        do:
          - handleFailure:
              set:
                status: failed-after-retries
                requiresManualReview: true
      then: finalizeTransaction
  - finalizeTransaction:
      emit:
        event:
          with:
            type: com.example.transaction.completed
            source: https://payments.example.com/events
`,
  },
  {
    id: 'parallel-fork-fanout',
    title: 'Parallel Fan-Out / Fan-In',
    icon: '⚡',
    description:
      'Dispatch notifications concurrently across Email, SMS, and Analytics audit logs using a fork task.',
    category: 'Parallel',
    tags: ['fork', 'parallel', 'call', 'emit'],
    specification: `document:
  dsl: "1.0.3"
  namespace: templates
  name: parallel-fork-fanout
  version: "1.0.0"
  metadata:
    category: parallel
    pattern: fanout
do:
  - prepareNotification:
      set:
        recipient: "\${ $input.email }"
        phone: "\${ $input.phone }"
        message: "\${ $input.message }"
      then: dispatchParallelChannels
  - dispatchParallelChannels:
      fork:
        compete: false
        branches:
          - sendEmail:
              call: email-service
              with:
                method: post
                endpoint: https://email.example.com/v1/send
                body:
                  to: "\${ $context.recipient }"
          - sendSms:
              call: sms-service
              with:
                method: post
                endpoint: https://sms.example.com/v1/send
                body:
                  phone: "\${ $context.phone }"
          - auditLog:
              emit:
                event:
                  with:
                    type: com.example.audit.notification-sent
                    source: https://audit.example.com
      then: recordDelivery
  - recordDelivery:
      set:
        allDispatched: true
`,
  },
  {
    id: 'batch-for-loop-processing',
    title: 'Batch Collection Processor',
    icon: '🔁',
    description:
      'Iterate over an array of items with a for-each loop, executing transformations for each record.',
    category: 'Automation',
    tags: ['for', 'iteration', 'batch', 'set'],
    specification: `document:
  dsl: "1.0.3"
  namespace: templates
  name: batch-for-loop-processing
  version: "1.0.0"
  metadata:
    category: automation
    pattern: for-each
do:
  - loadRecords:
      set:
        batchId: "\${ $input.batchId }"
        records: "\${ $input.records }"
      then: processItems
  - processItems:
      for:
        each: record
        in: "\${ $context.records }"
        at: index
      do:
        - transformRecord:
            set:
              processed: true
              timestamp: "\${ $context.index }"
      then: completeBatch
  - completeBatch:
      emit:
        event:
          with:
            type: com.example.batch.finished
            source: https://batch.example.com
`,
  },
  {
    id: 'reusable-functions-orchestrator',
    title: 'Reusable Functions & Common Notifier',
    icon: '🧩',
    description:
      'Demonstrates document-level reusable functions in use.functions and calling them via call: <functionName>.',
    category: 'Automation',
    tags: ['use.functions', 'call', 'set', 'emit'],
    specification: `document:
  dsl: "1.0.3"
  namespace: templates
  name: reusable-functions-orchestrator
  version: "1.0.0"
  metadata:
    category: automation
    pattern: reusable-functions
use:
  functions:
    sendAlert:
      emit:
        event:
          with:
            type: com.example.alert
            source: https://alerts.example.com
            data:
              recipient: "\${ $input.recipient }"
              message: "\${ $input.message }"
    calculateTax:
      set:
        taxAmount: "\${ $context.amount * 0.05 }"
        totalWithTax: "\${ $context.amount * 1.05 }"
do:
  - initializeOrder:
      set:
        orderId: "\${ $input.orderId }"
        amount: 1000
        customerEmail: "user@example.com"
      then: applyTaxFunction
  - applyTaxFunction:
      call: calculateTax
      then: notifyCustomer
  - notifyCustomer:
      call: sendAlert
      with:
        recipient: "\${ $context.customerEmail }"
        message: "Your order total is \${ $context.totalWithTax }"
`,
  },
];
