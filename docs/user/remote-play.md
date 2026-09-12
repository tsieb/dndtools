# Remote play

Bring everyone to the same table, even when their screens are in different rooms.

## Host and join online

The GM opens **Host** and starts online hosting when it is available. Share the online join code privately with your players. Each player opens **Join a table**, pastes it under **Online join code**, and chooses **Join online**. They can also use **Type the room and PIN instead** if you are reading the details aloud.

The GM must approve the request and choose the participant the joining device represents. Wait for **Connected** before relying on the shared view. A code gets someone to the door; approval determines who they are at the table.

Online controls appear only when cloud connectivity is available in the build. If they are absent, check the cloud setup and connection status. Do not keep retrying a local invite in the online-code field: the two flows use different codes.

## Join nearby

On a supported desktop build, **Tables on your network** lists nearby hosts. Select a table to ask to join, then wait for the GM's approval.

For the manual local connection, the GM shares an invite code. The player pastes it into **Invite code from your DM** and chooses **Join**. The player sends the resulting reply code back, and the GM uses it to finish connecting. Keep both devices on a network that allows them to reach one another.

## During play

The player companion shows the view shared with that participant. If the connection changes to reconnecting or closed, check the connection banner before assuming an action reached the table. The host must remain available for the live connection. Use **Leave table** when finished.

Connecting a player is separate from a cloud backup. For storage and recovery, read **Privacy modes**.

## Implementation references

Source review: 2026-09-12, repository baseline `b54cf4c7` (app 0.3.7). These are
local implementation and existing test references, not a claim that device, network,
or release-installation checks were run for this guide.

- [SessionPanel.tsx](../../apps/gm-react/src/net/SessionPanel.tsx)
- [HostModal.tsx](../../apps/gm-react/src/net/HostModal.tsx)
- [join.spec.ts](../../apps/gm-react/tests/e2e/join.spec.ts)
