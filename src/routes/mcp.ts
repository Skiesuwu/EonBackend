import { Router } from "express";
import logger from "../utils/logger";
import Account, { IAccount } from "../database/models/Account";
import User from "../database/models/User";
import { sendErrorResponse } from "./oauth";
import Athena from "../resources/mcp/MCPAthena";
import CommonCore from "../resources/mcp/MCPCommonCore";
import {
  EquipBattleRoyaleCustomization,
  SetCosmeticLockerSlot,
} from "../resources/mcp/MCPEquipBattleRoyaleCustomization";
import MCPCommonCore from "../resources/mcp/MCPCommonCore";
import catalog from "../resources/storefront/catalog.json";
import profile from "../../athena.json";
import axios from "axios";
import { getEnv } from "../utils";
import { IProfile } from "../resources/mcp/interfaces/ProfileInterface";
import quests from "../resources/quests/Season12Quests.json";
import { v4 as generateUUID } from "uuid";
import { AccountItem } from "../resources/quests/IQuests";

export default function initRoute(router: Router): void {
  router.post(
    "/fortnite/api/game/v2/profile/:accountId/*/MarkItemSeen",
    async (req, res) => {
      // TODO
      return res.json({}).status(201);
    }
  );

  router.post(
    [
      "/fortnite/api/game/v2/profile/:accountId/*/QueryProfile",
      "/fortnite/api/game/v2/profile/:accountId/*/SetHardcoreModifier",
    ],
    async (req, res) => {
      try {
        const { rvn, profileId } = req.query;
        const { accountId } = req.params;

        const userAgent = req.headers["user-agent"];
        const account = await User.findOne({ accountId }).lean();

        let season = userAgent?.split("-")[1]?.split(".")[0] || 2;

        if (!account) {
          return res.status(404).json({ error: "Account not found." });
        }

        if (!rvn) {
          return {};
        }

        if (profileId === "athena" || profileId === "profile0") {
          return res.json(
            await Athena(
              accountId,
              profileId,
              false,
              season,
              req.query.rvn || -1
            )
          );
        } else if (
          profileId === "common_core" ||
          profileId === "common_public"
        ) {
          return res.json(await CommonCore(accountId, profileId));
        } else {
          const responseData = {
            profileRevision: (rvn as any) + 1,
            profileId,
            profileChangesBaseRevision: 1,
            profileChanges: [],
            profileCommandRevision: 1,
            serverTime: new Date(),
            responseVersion: 1,
          };
          res.json(responseData);
        }
      } catch (error) {
        let err = error as Error;
        logger.error(`Error updating profile: ${err.message}`, "MCP");
        res.status(500).json({ error: "Internal Server Error" });
      }
    }
  );

  router.post(
    [
      "/fortnite/api/game/v2/profile/:accountId/*/EquipBattleRoyaleCustomization",
      "/fortnite/api/game/v2/profile/:accountId/*/SetCosmeticLockerSlot",
    ],
    async (req, res) => {
      try {
        const { accountId } = req.params;
        const {
          profileId,
          slotName,
          itemToSlot,
          indexWithinSlot,
          category,
          variantUpdates,
          rvn,
          slotIndex,
        } = req.body;

        if (req.body.slotName !== undefined) {
          return res.json(
            await EquipBattleRoyaleCustomization(
              accountId,
              profileId,
              slotName,
              itemToSlot,
              indexWithinSlot,
              variantUpdates,
              rvn
            )
          );
        } else {
          return res.json(
            await SetCosmeticLockerSlot(
              accountId,
              profileId,
              category,
              itemToSlot,
              slotIndex,
              variantUpdates,
              rvn as any
            )
          );
        }
      } catch (error) {
        let err = error as Error;
        logger.error(`Error updating profile: ${err.message}`, "MCP");
        res.status(500).json({ error: "Internal Server Error" });
      }
    }
  );
  router.post(
    "/fortnite/api/game/v2/profile/:accountId/client/PurchaseCatalogEntry",
    async (req, res) => {
      try {
        const { accountId } = req.params;
        const user = await User.findOne({ accountId });
        const account = await Account.findOne({ accountId });
        const profileId = req.query.profileId as string;
        const currency = req.query.currency as string;
        const athena = profile.profileChanges.find((data) => {
          return data;
        });

        const userAgent = req.headers["user-agent"];
        const season = (userAgent?.split("-")[1]?.split(".")[0] ||
          "2") as string;

        if (!user) {
          return res.status(404).json({ error: "User does not exist" });
        } else if (!account) {
          return res.status(404).json({ error: "Account does not exist" });
        }

        const baseRevision = account.profilerevision + 1;
        let selectedItem: any = null;
        let multiUpdates: any[] = [
          {
            profileRevision: account.RVN || 0,
            profileId: "athena",
            profileChangesBaseRevision: account.BaseRevision || 0,
            profileChanges: [],
            profileCommandRevision:
              profile.profileChanges.find((data) => data)?.profile
                .commandRevision || 0,
          },
        ];
        let notifications: any[] = [];
        let profileChanges: any[] = [
          {
            stats: {
              attributes: {},
            },
          },
        ];
        let givenItemsData: any[] = [];
        let updatedProfile;

        if (!account.items) {
          return (account.items = {});
        }

        const storefronts = catalog.storefronts.find((data) => data);
        const entries = storefronts?.catalogEntries.find((data) => data);
        const offerId = entries?.offerId as string;

        // Shop Purchasing attempt 5
        let AccountData = {
          _id: "RANDOM",
          Update: "",
          Created: new Date().toISOString(),
          updated: new Date().toISOString(),
          rvn: 0,
          wipeNumber: 1,
          accountId: "",
          profileId,
          version: "no_version",
          items: {},
          stats: {
            attributes: {},
          },
          commandRevision: 5,
        };

        let attributes = profileChanges.find((data) => {
          return data.stats.attributes;
        });

        AccountData["items"] = account.items;
        AccountData["stats"]["attributes"] = attributes;

        // get the latest shop
        const response = await axios
          .get(
            `${getEnv("ADDRESS")}:${getEnv(
              "PORT"
            )}/fortnite/api/storefront/v2/catalog`
          )
          .then((data) => data.data);

        let catalogPurchaseId: any = null;

        for (const storefront of response.storefronts) {
          console.log(storefront);
          for (const entries of storefront.catalogEntries) {
            console.log(entries);
            if (entries.offerId === offerId) {
              catalogPurchaseId = entries;
            }
          }
        }

        for (const storefronts of response.storefronts) {
          for (const entries of storefronts.catalogEntries) {
            console.log(entries["itemGrants"]);
            for (const storefront of entries.itemGrants) {
              console.log("chat is this real???");
              console.log(storefront);
              return givenItemsData.push({
                itemType: storefront.templateId,
                itemGuid: storefront.templateId,
                itemProfile: AccountData,
                quantity: storefront.quantity,
              });
            }
          }
        }

        const responseData = {
          profileRevision: (req.query.rvn as any) + 1 || 1,
          profileId,
          profileChangesBaseRevision: 1,
          profileChanges: [
            {
              changeType: "fullProfileUpdate",
            },
          ],
          notifications: [
            {
              type: "CatalogPurchase",
              primary: true,
              lootResult: {
                items: givenItemsData,
              },
            },
          ],
          profileCommandRevision: 1,
          serverTime: new Date(),
          responseVersion: 1,
        };

        return res.status(204).json(responseData);
      } catch (error) {
        const err = error as Error;
        logger.error(`Error processing purchase: ${err.message}`, "MCP");
        res.status(500).json({ error: "Internal Server Error" });
      }
    }
  );

  router.post(
    "/fortnite/api/game/v2/profile/:accountId/client/ClaimMfaEnabled",
    async (req, res) => {
      const { accountId } = req.params;
      const { profileId } = req.query;
      const account: IAccount | null = await Account.findOne({
        accountId,
      }).lean();

      const commonCore = await CommonCore(accountId, profileId as string).then(
        async (data) => {
          return data.profileChanges.find(
            (profileChangesData: any) =>
              profileChangesData.profile.stats.attributes
          );
        }
      );

      if (commonCore.mfa_enabled)
        return sendErrorResponse(
          res,
          "OperationForbidden",
          "MFA is already enabled on your account."
        );
    }
  );

  router.post(
    "/fortnite/api/game/v2/profile/:accountId/client/ExchangeGameCurrencyForBattlePassOffer",
    async (req, res) => {
      try {
        const { offerItemIdList } = req.body;
        const { profileId, rvn } = req.query;

        const responseData = {
          profileRevision: (rvn as any) + 1 || 1,
          profileId,
          profileChangesBaseRevision: 1,
          profileChanges: [
            {
              changeType: "fullProfileUpdate",
              profile: {},
            },
          ],
          profileCommandRevision: 1,
          serverTime: new Date(),
          responseVersion: 1,
        };
      } catch (error) {
        let err = error as Error;
        logger.error(
          `ExchangeGameCurrencyForBattlePassOffer: ${err.message}`,
          "MCP"
        );
        return res.status(500).json({ error: "Internal Server Error" });
      }
    }
  );

  router.post(
    "/fortnite/api/game/v2/profile/:accountId/client/GiftCatalogEntry",
    async (req, res) => {
      try {
        const {
          receiverAccountIds,
          giftWrapTemplateId,
          personalMessage,
          offerId,
        } = req.body;
        const { rvn, profileId } = req.query;
        const { accountId } = req.params;

        const friends: IAccount | null = await Account.findOne({
          accountId: receiverAccountIds[0],
        }).lean();

        if (!friends) {
          return res.status(404).json({ error: "User not found." });
        }

        let allGifts: any[] = [];

        // get latest shop
        const response = await axios
          .get(
            `${getEnv("ADDRESS")}:${getEnv(
              "PORT"
            )}/fortnite/api/storefront/v2/catalog`
          )
          .then((data) => data.data);

        let catalogPurchaseId: any = null;

        for (const storefront of response.storefronts) {
          for (const entries of storefront.catalogEntries) {
            if (entries.offerId === offerId) {
              catalogPurchaseId = entries;
            }
          }
        }

        for (const userGifts of friends.gifts) {
          return allGifts.push({
            giftbox: userGifts.giftbox || "GiftBox:gb_default",
            personsend: accountId,
            giftedAt: userGifts.giftedAt,
            message: userGifts.message || "We Hope you enjoy playing Eon :)",
            itemGuid: userGifts.itemGuid,
            items: userGifts.items,
          });
        }

        allGifts.push({
          giftbox: giftWrapTemplateId || "GiftBox:gb_default",
          personsend: accountId,
          message: personalMessage || "We Hope you enjoy playing Eon :)",
          itemGuid: offerId,
          items: catalogPurchaseId["itemGrants"],
        });

        await Account.updateOne(
          { accountId: receiverAccountIds[0] },
          { ["gifts"]: allGifts }
        );

        const responseData = {
          profileRevision: (rvn as any) + 1,
          profileId,
          profileChangesBaseRevision: 1,
          profileChanges: [],
          profileCommandRevision: 1,
          serverTime: new Date(),
          responseVersion: 1,
        };

        res.json(responseData);
      } catch (error) {
        let err = error as Error;
        logger.error(
          `Error getting catalogEntry for gift: ${err.message}`,
          "MCP"
        );
        return res.status(500).json({ error: "Internal Server Error" });
      }
    }
  );

  router.post(
    "/fortnite/api/game/v2/profile/:accountId/client/RemoveGiftBox",
    async (req, res) => {
      try {
        const rvn = req.query.rvn;
        const accountId = req.params.accountId;
        const profileId = req.query.profileId;
        const userAgent = req.headers["user-agent"];
        let season = userAgent?.split("-")[1]?.split(".")[0] || 2;
        const account = await Account.findOne({ accountId });
        const giftBoxItemId = req.body.giftBoxItemId;
        const giftBoxItemIds = req.body.giftBoxItemIds;

        if (!account) {
          return res.json({
            error: "Oops! This account seems to have vanished.",
          });
        }

        const applyProfileChanges: any[] = [];
        const queryRevision = rvn || "-1";
        const baseRevision = account.BaseRevision || 0;

        if (typeof req.body.giftBoxItemId === "string") {
          if (!account.gifts[req.body.giftBoxItemId]) {
            return sendErrorResponse(
              res,
              "InvalidGift",
              `Sorry, your buddy doesn't have this gift.`
            );
          }

          if (
            !account.gifts[req.body.giftBoxItemId].templateId.startsWith(
              "GiftBox:"
            )
          ) {
            return sendErrorResponse(
              res,
              "NotAGiftBox",
              `The specified item is not a gift box.`
            );
          }

          const updatedGifts = account.gifts.filter(
            (e: any) => e.templateId !== req.body.giftBoxItemId
          );
          applyProfileChanges.push({
            changeType: "itemRemoved",
            itemId: req.body.giftBoxItemId,
          });

          await Account.updateOne({ $set: { gifts: updatedGifts } });
        }

        if (Array.isArray(giftBoxItemIds)) {
          const updatedGifts: any[] = [];

          giftBoxItemIds.forEach((entry: any) => {
            if (
              account.gifts[entry] &&
              account.gifts[entry].templateId.startsWith("GiftBox:")
            ) {
              applyProfileChanges.push({
                changeType: "itemRemoved",
                itemId: entry,
              });
            } else {
              account.gifts.forEach((e: any) => {
                if (e.templateId != entry) {
                  updatedGifts.push(e);
                }
              });
            }
          });

          await Account.updateOne({ $set: { gifts: updatedGifts } });
        }

        if (applyProfileChanges.length > 0) {
          await Account.updateOne({
            profilerevision: account.profilerevision + 1,
          });
          await Account.updateOne({
            BaseRevision: account.BaseRevision + 1,
          });
        }

        const updatedAccount = await Account.findOne({ accountId });

        // @ts-ignore
        if (queryRevision !== updatedAccount!.BaseRevision) {
          const commonCore = MCPCommonCore(
            accountId,
            profileId as string,
            true
          );

          applyProfileChanges.push({
            changeType: "fullProfileUpdate",
            profile: commonCore,
          });
        }

        return res.json({
          profileRevision: updatedAccount!.BaseRevision || 0,
          profileId,
          profileChangesBaseRevision: queryRevision,
          profileChanges: applyProfileChanges,
          profileCommandRevision: updatedAccount!.profilerevision || 0,
          serverTime: new Date().toISOString(),
          customResponse: "Thanks for using eon!",
        });
      } catch (error) {
        const err = error as Error;
        logger.error(`Error removing gift box: ${err.message}`, "MCP");
        res.status(500).json({ error: "Internal Server Error" });
      }
    }
  );

  router.post(
    "/fortnite/api/game/v2/profile/:accountId/*/ClientQuestLogin",
    async (req, res) => {
      try {
        const { rvn, profileId } = req.query;
        const { accountId } = req.params;
        const userAgent = req.headers["user-agent"];
        const season = (userAgent?.split("-")[1]?.split(".")[0] || 2) as string;

        const account = await Account.findOne({ accountId });

        if (!rvn) {
          return res.json({});
        }

        if (!account) {
          return res.status(404).json({
            error: "[ClientQuestLogin]: Account Not Found.",
          });
        }

        if (profileId === "athena" || profileId === "profile0") {
          const currentQuests = quests.Season12;
          const athenaData = (await Athena(
            accountId,
            profileId,
            false,
            season,
            rvn
          )) as any;

          if (!athenaData) {
            // Handle the case when athenaData is undefined or null
            return res.status(400).json({
              error: "AthenaData not found.",
            });
          }

          const currentProfile: IProfile = {
            accountId,
            profileId,
            version: "Eon",
            rvn: rvn as any,
            items: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            stats: {
              attributes: {},
              templateId: quests.Season12.Quests.find((data) => data.templateId)
                ?.templateId,
            },
            commandRevision: 1,
          };

          // Add checks for uniqueQuests and set newQuest accordingly
          let uniqueQuests: any[] = [];
          let newQuest = {};

          if (athenaData.items) {
            console.log(athenaData.items);
          }

          if (uniqueQuests.length === 0) {
            const randomQuest =
              uniqueQuests[Math.floor(Math.random() * uniqueQuests.length)];

            newQuest = {
              [generateUUID()]: {
                templateId: "Quest:quest_operation_damageplayers",
                attributes: {
                  quest_state: "Active",
                  level: -1,
                  item_seen: false,
                  sent_new_notification: false,
                  xp_reward_scalar: 1,
                  challenge_bundle_id: "",
                  challenge_linked_quest_given: "",
                  challenge_linked_quest_parent: "",
                  playlists: [],
                  bucket: getEnv("NETCLI"),
                  last_state_change_time: new Date().toISOString(),
                  max_level_bonus: 0,
                  xp: 0,
                  quest_rarity: "uncommon",
                  favorite: false,
                  quest_pool: "",
                  creation_time: new Date().toISOString(),
                  ...Object.fromEntries(
                    [
                      {
                        name: "quest_operation_damageplayers_obj",
                        count: 1000,
                      },
                    ].map((data: any) => [`completion_${data}`, 0])
                  ),
                },
                quantity: 1,
              },
            };

            const questManager = {
              dailyLoginInterval: new Date().toISOString(),
              questPoolState: {
                dailyLoginInterval: new Date().toISOString(),
              },
              dailyQuestRerolls: 1,
            };

            currentProfile.stats.attributes.quest_manager = questManager;
          }

          return res.json({
            profileRevision: (rvn as any) + 1,
            profileId,
            profileChangesBaseRevision: account.BaseRevision,
            profileChanges: [
              {
                changeType: "fullProfileUpdate",
                profile: currentProfile,
              },
            ],
            notifications: [],
            multiUpdate: [],
            profileCommandRevision: 1,
            serverTime: new Date(),
            responseVersion: 1,
          });
        } else {
          const responseData = {
            profileRevision: (rvn as any) + 1,
            profileId,
          };
          res.json(responseData);
        }
      } catch (error) {
        const err = error as Error;
        console.error(`Error updating ClientQuestLogin: ${err.message}`);
        res.status(500).json({ error: "Internal Server Error" });
      }
    }
  );
}
