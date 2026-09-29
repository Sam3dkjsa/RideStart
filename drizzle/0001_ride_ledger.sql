CREATE TABLE `ride_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`rideDate` date NOT NULL,
	`ridesCompleted` int NOT NULL,
	`distanceKm` decimal(10,2) NOT NULL,
	`grossEarnings` decimal(14,2) NOT NULL,
	`platformFees` decimal(14,2) NOT NULL,
	`otherCosts` decimal(14,2) NOT NULL,
	`assumptionVehicleEfficiencyKmPerLiter` decimal(8,3) NOT NULL,
	`assumptionFuelPricePerLiter` decimal(14,2) NOT NULL,
	`assumptionMaintenanceReservePerKm` decimal(14,2) NOT NULL,
	`fuelLiters` decimal(12,3) NOT NULL,
	`fuelCost` decimal(14,2) NOT NULL,
	`maintenanceReserve` decimal(14,2) NOT NULL,
	`netProfit` decimal(14,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ride_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `ride_entries_user_date_uq` UNIQUE(`userId`,`rideDate`)
);
--> statement-breakpoint
CREATE TABLE `rider_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'INR',
	`vehicleEfficiencyKmPerLiter` decimal(8,3) NOT NULL,
	`fuelPricePerLiter` decimal(14,2) NOT NULL,
	`maintenanceReservePerKm` decimal(14,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rider_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `rider_settings_user_uq` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `ride_entries` ADD CONSTRAINT `ride_entries_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rider_settings` ADD CONSTRAINT `rider_settings_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;