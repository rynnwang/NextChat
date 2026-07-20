import { useState, useEffect, useMemo } from "react";

import styles from "./settings.module.scss";

import ResetIcon from "../icons/reload.svg";
import AddIcon from "../icons/add.svg";
import CloseIcon from "../icons/close.svg";
import CopyIcon from "../icons/copy.svg";
import ClearIcon from "../icons/clear.svg";
import EditIcon from "../icons/edit.svg";
import EyeIcon from "../icons/eye.svg";
import DownloadIcon from "../icons/download.svg";
import UploadIcon from "../icons/upload.svg";
import {
  Input,
  List,
  ListItem,
  Modal,
  Popover,
  Select,
  showConfirm,
} from "./ui-lib";
import { ModelConfigList } from "./model-config";
import { MaasProviderSettings } from "./maas-provider-settings";

import { IconButton } from "./button";
import {
  SubmitKey,
  useChatStore,
  Theme,
  useUpdateStore,
  useAccessStore,
  useAppConfig,
} from "../store";

import Locale, {
  AllLangs,
  ALL_LANG_OPTIONS,
  changeLang,
  getLang,
} from "../locales";
import { copyToClipboard } from "../utils";
import { OPENAI_BASE_URL, Path, SlotID } from "../constant";
import { Prompt, SearchService, usePromptStore } from "../store/prompt";
import { ErrorBoundary } from "./error";
import { InputRange } from "./input-range";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarPicker } from "./emoji";
import { getClientConfig } from "../config/client";
import { useSyncStore } from "../store/sync";
import { nanoid } from "nanoid";
import { useMaskStore } from "../store/mask";
import { TTSConfigList } from "./tts-config";
import { RealtimeConfigList } from "./realtime-chat/realtime-config";

function EditPromptModal(props: { id: string; onClose: () => void }) {
  const promptStore = usePromptStore();
  const prompt = promptStore.get(props.id);

  return prompt ? (
    <div className="modal-mask">
      <Modal
        title={Locale.Settings.Prompt.EditModal.Title}
        onClose={props.onClose}
        actions={[
          <IconButton
            key=""
            onClick={props.onClose}
            text={Locale.UI.Confirm}
            bordered
          />,
        ]}
      >
        <div className={styles["edit-prompt-modal"]}>
          <input
            type="text"
            value={prompt.title}
            readOnly={!prompt.isUser}
            className={styles["edit-prompt-title"]}
            onInput={(e) =>
              promptStore.updatePrompt(
                props.id,
                (prompt) => (prompt.title = e.currentTarget.value),
              )
            }
          ></input>
          <Input
            value={prompt.content}
            readOnly={!prompt.isUser}
            className={styles["edit-prompt-content"]}
            rows={10}
            onInput={(e) =>
              promptStore.updatePrompt(
                props.id,
                (prompt) => (prompt.content = e.currentTarget.value),
              )
            }
          ></Input>
        </div>
      </Modal>
    </div>
  ) : null;
}

function UserPromptModal(props: { onClose?: () => void }) {
  const promptStore = usePromptStore();
  const userPrompts = promptStore.getUserPrompts();
  const builtinPrompts = SearchService.builtinPrompts;
  const allPrompts = userPrompts.concat(builtinPrompts);
  const [searchInput, setSearchInput] = useState("");
  const [searchPrompts, setSearchPrompts] = useState<Prompt[]>([]);
  const prompts = searchInput.length > 0 ? searchPrompts : allPrompts;

  const [editingPromptId, setEditingPromptId] = useState<string>();

  useEffect(() => {
    if (searchInput.length > 0) {
      const searchResult = SearchService.search(searchInput);
      setSearchPrompts(searchResult);
    } else {
      setSearchPrompts([]);
    }
  }, [searchInput]);

  return (
    <div className="modal-mask">
      <Modal
        title={Locale.Settings.Prompt.Modal.Title}
        onClose={() => props.onClose?.()}
        actions={[
          <IconButton
            key="add"
            onClick={() => {
              const promptId = promptStore.add({
                id: nanoid(),
                createdAt: Date.now(),
                title: "Empty Prompt",
                content: "Empty Prompt Content",
              });
              setEditingPromptId(promptId);
            }}
            icon={<AddIcon />}
            bordered
            text={Locale.Settings.Prompt.Modal.Add}
          />,
        ]}
      >
        <div className={styles["user-prompt-modal"]}>
          <input
            type="text"
            className={styles["user-prompt-search"]}
            placeholder={Locale.Settings.Prompt.Modal.Search}
            value={searchInput}
            onInput={(e) => setSearchInput(e.currentTarget.value)}
          ></input>

          <div className={styles["user-prompt-list"]}>
            {prompts.map((v, _) => (
              <div className={styles["user-prompt-item"]} key={v.id ?? v.title}>
                <div className={styles["user-prompt-header"]}>
                  <div className={styles["user-prompt-title"]}>{v.title}</div>
                  <div className={styles["user-prompt-content"] + " one-line"}>
                    {v.content}
                  </div>
                </div>

                <div className={styles["user-prompt-buttons"]}>
                  {v.isUser && (
                    <IconButton
                      icon={<ClearIcon />}
                      className={styles["user-prompt-button"]}
                      onClick={() => promptStore.remove(v.id!)}
                    />
                  )}
                  {v.isUser ? (
                    <IconButton
                      icon={<EditIcon />}
                      className={styles["user-prompt-button"]}
                      onClick={() => setEditingPromptId(v.id)}
                    />
                  ) : (
                    <IconButton
                      icon={<EyeIcon />}
                      className={styles["user-prompt-button"]}
                      onClick={() => setEditingPromptId(v.id)}
                    />
                  )}
                  <IconButton
                    icon={<CopyIcon />}
                    className={styles["user-prompt-button"]}
                    onClick={() => copyToClipboard(v.content)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {editingPromptId !== undefined && (
        <EditPromptModal
          id={editingPromptId!}
          onClose={() => setEditingPromptId(undefined)}
        />
      )}
    </div>
  );
}

function DangerItems() {
  const chatStore = useChatStore();
  const appConfig = useAppConfig();

  return (
    <List>
      <ListItem
        title={Locale.Settings.Danger.Reset.Title}
        subTitle={Locale.Settings.Danger.Reset.SubTitle}
      >
        <IconButton
          aria={Locale.Settings.Danger.Reset.Title}
          text={Locale.Settings.Danger.Reset.Action}
          onClick={async () => {
            if (await showConfirm(Locale.Settings.Danger.Reset.Confirm)) {
              appConfig.reset();
            }
          }}
          type="danger"
        />
      </ListItem>
      <ListItem
        title={Locale.Settings.Danger.Clear.Title}
        subTitle={Locale.Settings.Danger.Clear.SubTitle}
      >
        <IconButton
          aria={Locale.Settings.Danger.Clear.Title}
          text={Locale.Settings.Danger.Clear.Action}
          onClick={async () => {
            if (await showConfirm(Locale.Settings.Danger.Clear.Confirm)) {
              chatStore.clearAllData();
            }
          }}
          type="danger"
        />
      </ListItem>
    </List>
  );
}

function SyncItems() {
  const syncStore = useSyncStore();
  const chatStore = useChatStore();
  const promptStore = usePromptStore();
  const maskStore = useMaskStore();

  const stateOverview = useMemo(() => {
    const sessions = chatStore.sessions;
    const messageCount = sessions.reduce((p, c) => p + c.messages.length, 0);

    return {
      chat: sessions.length,
      message: messageCount,
      prompt: Object.keys(promptStore.prompts).length,
      mask: Object.keys(maskStore.masks).length,
    };
  }, [chatStore.sessions, maskStore.masks, promptStore.prompts]);

  return (
    <>
      <List>
        {syncStore.cloudSync() && (
          <ListItem
            title={Locale.Settings.Sync.CloudState}
            subTitle={
              syncStore.lastSyncTime
                ? new Date(syncStore.lastSyncTime).toLocaleString()
                : Locale.Settings.Sync.NotSyncYet
            }
          />
        )}

        <ListItem
          title={Locale.Settings.Sync.LocalState}
          subTitle={Locale.Settings.Sync.Overview(stateOverview)}
        >
          <div style={{ display: "flex" }}>
            <IconButton
              aria={Locale.Settings.Sync.LocalState + Locale.UI.Export}
              icon={<UploadIcon />}
              text={Locale.UI.Export}
              onClick={() => {
                syncStore.export();
              }}
            />
            <IconButton
              aria={Locale.Settings.Sync.LocalState + Locale.UI.Import}
              icon={<DownloadIcon />}
              text={Locale.UI.Import}
              onClick={() => {
                syncStore.import();
              }}
            />
          </div>
        </ListItem>
      </List>
    </>
  );
}

export function Settings() {
  const navigate = useNavigate();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const config = useAppConfig();
  const updateConfig = config.update;

  const updateStore = useUpdateStore();

  const accessStore = useAccessStore();
  const shouldHideBalanceQuery = useMemo(() => {
    const isOpenAiUrl = accessStore.openaiUrl.includes(OPENAI_BASE_URL);

    return accessStore.hideBalanceQuery || isOpenAiUrl;
  }, [accessStore.hideBalanceQuery, accessStore.openaiUrl]);

  const usage = {
    used: updateStore.used,
    subscription: updateStore.subscription,
  };
  const [loadingUsage, setLoadingUsage] = useState(false);
  function checkUsage(force = false) {
    if (shouldHideBalanceQuery) {
      return;
    }

    setLoadingUsage(true);
    updateStore.updateUsage(force).finally(() => {
      setLoadingUsage(false);
    });
  }

  const promptStore = usePromptStore();
  const builtinCount = SearchService.count.builtin;
  const customCount = promptStore.getUserPrompts().length ?? 0;
  const [shouldShowPromptModal, setShowPromptModal] = useState(false);

  const showUsage = accessStore.isAuthorized();
  useEffect(() => {
    // checks per minutes
    showUsage && checkUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const keydownEvent = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        navigate(Path.Home);
      }
    };
    if (clientConfig?.isApp) {
      // Force to set custom endpoint to true if it's app
      accessStore.update((state) => {
        state.useCustomConfig = true;
      });
    }
    document.addEventListener("keydown", keydownEvent);
    return () => {
      document.removeEventListener("keydown", keydownEvent);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clientConfig = useMemo(() => getClientConfig(), []);

  return (
    <ErrorBoundary>
      <div className="window-header" data-tauri-drag-region>
        <div className="window-header-title">
          <div className="window-header-main-title">
            {Locale.Settings.Title}
          </div>
          <div className="window-header-sub-title">
            {Locale.Settings.SubTitle}
          </div>
        </div>
        <div className="window-actions">
          <div className="window-action-button"></div>
          <div className="window-action-button"></div>
          <div className="window-action-button">
            <IconButton
              aria={Locale.UI.Close}
              icon={<CloseIcon />}
              onClick={() => navigate(Path.Home)}
              bordered
            />
          </div>
        </div>
      </div>
      <div className={styles["settings"]}>
        <List>
          <ListItem title={Locale.Settings.Avatar}>
            <Popover
              onClose={() => setShowEmojiPicker(false)}
              content={
                <AvatarPicker
                  onEmojiClick={(avatar: string) => {
                    updateConfig((config) => (config.avatar = avatar));
                    setShowEmojiPicker(false);
                  }}
                />
              }
              open={showEmojiPicker}
            >
              <div
                aria-label={Locale.Settings.Avatar}
                tabIndex={0}
                className={styles.avatar}
                onClick={() => {
                  setShowEmojiPicker(!showEmojiPicker);
                }}
              >
                <Avatar avatar={config.avatar} />
              </div>
            </Popover>
          </ListItem>

          <ListItem title={Locale.Settings.SendKey}>
            <Select
              aria-label={Locale.Settings.SendKey}
              value={config.submitKey}
              onChange={(e) => {
                updateConfig(
                  (config) =>
                    (config.submitKey = e.target.value as any as SubmitKey),
                );
              }}
            >
              {Object.values(SubmitKey).map((v) => (
                <option value={v} key={v}>
                  {v}
                </option>
              ))}
            </Select>
          </ListItem>

          <ListItem title={Locale.Settings.Theme}>
            <Select
              aria-label={Locale.Settings.Theme}
              value={config.theme}
              onChange={(e) => {
                updateConfig(
                  (config) => (config.theme = e.target.value as any as Theme),
                );
              }}
            >
              {Object.values(Theme).map((v) => (
                <option value={v} key={v}>
                  {v}
                </option>
              ))}
            </Select>
          </ListItem>

          <ListItem title={Locale.Settings.Lang.Name}>
            <Select
              aria-label={Locale.Settings.Lang.Name}
              value={getLang()}
              onChange={(e) => {
                changeLang(e.target.value as any);
              }}
            >
              {AllLangs.map((lang) => (
                <option value={lang} key={lang}>
                  {ALL_LANG_OPTIONS[lang]}
                </option>
              ))}
            </Select>
          </ListItem>

          <ListItem
            title={Locale.Settings.FontSize.Title}
            subTitle={Locale.Settings.FontSize.SubTitle}
          >
            <InputRange
              aria={Locale.Settings.FontSize.Title}
              title={`${config.fontSize ?? 14}px`}
              value={config.fontSize}
              min="12"
              max="40"
              step="1"
              onChange={(e) =>
                updateConfig(
                  (config) =>
                    (config.fontSize = Number.parseInt(e.currentTarget.value)),
                )
              }
            ></InputRange>
          </ListItem>

          <ListItem
            title={Locale.Settings.FontFamily.Title}
            subTitle={Locale.Settings.FontFamily.SubTitle}
          >
            <input
              aria-label={Locale.Settings.FontFamily.Title}
              type="text"
              value={config.fontFamily}
              placeholder={Locale.Settings.FontFamily.Placeholder}
              onChange={(e) =>
                updateConfig(
                  (config) => (config.fontFamily = e.currentTarget.value),
                )
              }
            ></input>
          </ListItem>

          <ListItem
            title={Locale.Settings.AutoGenerateTitle.Title}
            subTitle={Locale.Settings.AutoGenerateTitle.SubTitle}
          >
            <input
              aria-label={Locale.Settings.AutoGenerateTitle.Title}
              type="checkbox"
              checked={config.enableAutoGenerateTitle}
              onChange={(e) =>
                updateConfig(
                  (config) =>
                    (config.enableAutoGenerateTitle = e.currentTarget.checked),
                )
              }
            ></input>
          </ListItem>

          <ListItem
            title={Locale.Settings.SendPreviewBubble.Title}
            subTitle={Locale.Settings.SendPreviewBubble.SubTitle}
          >
            <input
              aria-label={Locale.Settings.SendPreviewBubble.Title}
              type="checkbox"
              checked={config.sendPreviewBubble}
              onChange={(e) =>
                updateConfig(
                  (config) =>
                    (config.sendPreviewBubble = e.currentTarget.checked),
                )
              }
            ></input>
          </ListItem>

          <ListItem
            title={Locale.Mask.Config.Artifacts.Title}
            subTitle={Locale.Mask.Config.Artifacts.SubTitle}
          >
            <input
              aria-label={Locale.Mask.Config.Artifacts.Title}
              type="checkbox"
              checked={config.enableArtifacts}
              onChange={(e) =>
                updateConfig(
                  (config) =>
                    (config.enableArtifacts = e.currentTarget.checked),
                )
              }
            ></input>
          </ListItem>
          <ListItem
            title={Locale.Mask.Config.CodeFold.Title}
            subTitle={Locale.Mask.Config.CodeFold.SubTitle}
          >
            <input
              aria-label={Locale.Mask.Config.CodeFold.Title}
              type="checkbox"
              checked={config.enableCodeFold}
              data-testid="enable-code-fold-checkbox"
              onChange={(e) =>
                updateConfig(
                  (config) => (config.enableCodeFold = e.currentTarget.checked),
                )
              }
            ></input>
          </ListItem>
        </List>

        <SyncItems />

        <List>
          <ListItem
            title={Locale.Settings.Mask.Splash.Title}
            subTitle={Locale.Settings.Mask.Splash.SubTitle}
          >
            <input
              aria-label={Locale.Settings.Mask.Splash.Title}
              type="checkbox"
              checked={!config.dontShowMaskSplashScreen}
              onChange={(e) =>
                updateConfig(
                  (config) =>
                    (config.dontShowMaskSplashScreen =
                      !e.currentTarget.checked),
                )
              }
            ></input>
          </ListItem>

          <ListItem
            title={Locale.Settings.Mask.Builtin.Title}
            subTitle={Locale.Settings.Mask.Builtin.SubTitle}
          >
            <input
              aria-label={Locale.Settings.Mask.Builtin.Title}
              type="checkbox"
              checked={config.hideBuiltinMasks}
              onChange={(e) =>
                updateConfig(
                  (config) =>
                    (config.hideBuiltinMasks = e.currentTarget.checked),
                )
              }
            ></input>
          </ListItem>
        </List>

        <List>
          <ListItem
            title={Locale.Settings.Prompt.Disable.Title}
            subTitle={Locale.Settings.Prompt.Disable.SubTitle}
          >
            <input
              aria-label={Locale.Settings.Prompt.Disable.Title}
              type="checkbox"
              checked={config.disablePromptHint}
              onChange={(e) =>
                updateConfig(
                  (config) =>
                    (config.disablePromptHint = e.currentTarget.checked),
                )
              }
            ></input>
          </ListItem>

          <ListItem
            title={Locale.Settings.Prompt.List}
            subTitle={Locale.Settings.Prompt.ListCount(
              builtinCount,
              customCount,
            )}
          >
            <IconButton
              aria={Locale.Settings.Prompt.List + Locale.Settings.Prompt.Edit}
              icon={<EditIcon />}
              text={Locale.Settings.Prompt.Edit}
              onClick={() => setShowPromptModal(true)}
            />
          </ListItem>
        </List>

        <MaasProviderSettings />

        <List id={SlotID.CustomModel}>
          {!shouldHideBalanceQuery && !clientConfig?.isApp ? (
            <ListItem
              title={Locale.Settings.Usage.Title}
              subTitle={
                showUsage
                  ? loadingUsage
                    ? Locale.Settings.Usage.IsChecking
                    : Locale.Settings.Usage.SubTitle(
                        usage?.used ?? "[?]",
                        usage?.subscription ?? "[?]",
                      )
                  : Locale.Settings.Usage.NoAccess
              }
            >
              {!showUsage || loadingUsage ? (
                <div />
              ) : (
                <IconButton
                  icon={<ResetIcon></ResetIcon>}
                  text={Locale.Settings.Usage.Check}
                  onClick={() => checkUsage(true)}
                />
              )}
            </ListItem>
          ) : null}
        </List>

        <List>
          <ModelConfigList
            modelConfig={config.modelConfig}
            updateConfig={(updater) => {
              const modelConfig = { ...config.modelConfig };
              updater(modelConfig);
              config.update((config) => (config.modelConfig = modelConfig));
            }}
          />
        </List>

        {shouldShowPromptModal && (
          <UserPromptModal onClose={() => setShowPromptModal(false)} />
        )}
        <List>
          <RealtimeConfigList
            realtimeConfig={config.realtimeConfig}
            updateConfig={(updater) => {
              const realtimeConfig = { ...config.realtimeConfig };
              updater(realtimeConfig);
              config.update(
                (config) => (config.realtimeConfig = realtimeConfig),
              );
            }}
          />
        </List>
        <List>
          <TTSConfigList
            ttsConfig={config.ttsConfig}
            updateConfig={(updater) => {
              const ttsConfig = { ...config.ttsConfig };
              updater(ttsConfig);
              config.update((config) => (config.ttsConfig = ttsConfig));
            }}
          />
        </List>

        <DangerItems />
      </div>
    </ErrorBoundary>
  );
}
